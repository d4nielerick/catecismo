import SwiftUI

/// A tela do dia, no desenho do site no celular: papel claro, moldura floral vermelha nas
/// laterais, fita marcadora, data grande em Times itálico, calendário e as leituras.
struct HojeView: View {
    /// Depuração: `-dia AAAA-MM-DD` abre num dia; `-irPara salmo` rola até essa aba depois de carregar
    /// (primeira, salmo, segunda, evangelho ou o número da aba).
    @State private var data = UserDefaults.standard.string(forKey: "dia").flatMap(Datas.data) ?? Date()
    @State private var dia: Dia?
    @State private var erro = false
    @State private var audios: Set<String> = []
    @State private var avisos = Avisos.ligados()
    /// Depuração: `-abrirMenu YES` nos argumentos de lançamento abre o menu ao iniciar.
    @State private var menuAberto = UserDefaults.standard.bool(forKey: "abrirMenu")
    @State private var destaques: [String: Indice.Destaque] = [:]
    @State private var limites: (String, String)?
    @StateObject private var player = Player()
    /// Resumo, trechos, santo e comentário do dia (cada um pode faltar).
    @State private var extras = ExtrasDoDia()
    @State private var pedidoCard: PedidoCard?
    @State private var sobreAberto = false
    @State private var comentarioAberto = false
    @Namespace private var vidro

    /// Aba ativa (índice em `abas`) e até quando a rolagem não a muda (depois de um toque).
    @State private var ativa = 0
    @State private var travadaAte = Date.distantPast
    @State private var alturaVisivel: CGFloat = 800

    private var chave: String { Datas.chave(data) }
    private var blocos: [Bloco] { dia?.blocos ?? [] }
    private var abas: [Bloco] { blocos.filter(\.temAba) }
    private let molaLuz = Animation.spring(response: 0.5, dampingFraction: 0.68)

    var body: some View {
        GeometryReader { tela in
            let lado = Barra.lado(largura: tela.size.width, abas: abas.count)
            ScrollViewReader { rolagem in
                ZStack(alignment: .top) {
                    Estilo.fundo.ignoresSafeArea()
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            Color.clear.frame(height: 0).id("topo")
                            cabecalho
                            Rectangle().fill(Estilo.linha).frame(height: 1).padding(.top, 28)
                            Calendario(selecionado: $data, destaques: destaques)
                                .padding(.top, 28)
                            conteudo
                            outrosDias(rolagem)
                        }
                        .padding(.horizontal, Estilo.lado)
                        .padding(.top, 18)
                        // o fim do texto não fica sob a barra de vidro
                        .padding(.bottom, Barra.altura(lado) + 44)
                        .overlay(alignment: .topTrailing) { Fita(cor: dia?.cor ?? "branco").padding(.trailing, Estilo.lado) }
                    }
                    .scrollIndicators(.hidden)
                    .coordinateSpace(name: "rolagem")
                    .background(GeometryReader { g in
                        Color.clear.onAppear { alturaVisivel = g.size.height }
                            .onChange(of: g.size.height) { _, h in alturaVisivel = h }
                    })
                    .onPreferenceChange(PosicoesAbas.self) { acompanhar($0) }
                    .onChange(of: chave) { rolagem.scrollTo("topo") }
                    GeometryReader { g in   // faixa de papel sob a barra de status, para o texto não passar por baixo dela
                        Estilo.fundo.frame(height: g.safeAreaInsets.top).ignoresSafeArea(edges: .top)
                    }.allowsHitTesting(false)
                    Moldura().ignoresSafeArea()
                    MenuVidro(data: $data, avisos: $avisos, aberto: $menuAberto, lado: lado, ns: vidro) {
                        BarraLeituras(blocos: abas, ativa: ativa, lado: lado,
                                      larguraAba: Barra.larguraAba(largura: tela.size.width, abas: abas.count, lado: lado), ns: vidro,
                                      anterior: existe(-1), proximo: existe(1),
                                      tocarAba: { irPara($0, rolagem) },
                                      mudarDia: { n in withAnimation(.easeInOut(duration: 0.2)) { mover(n) } })
                    }
                    .animation(.spring(response: 0.4, dampingFraction: 0.82), value: abas.count)
                }
                .task(id: chave) {
                    await carregar()
                    if let alvo = UserDefaults.standard.string(forKey: "irPara"), ["resumo", "comentario", "alternativa"].contains(alvo) {
                        try? await Task.sleep(for: .milliseconds(500))
                        rolagem.scrollTo(alvo, anchor: UnitPoint(x: 0.5, y: 0.08))
                    } else if let alvo = UserDefaults.standard.string(forKey: "irPara"), let i = indiceDaAba(alvo) {
                        try? await Task.sleep(for: .milliseconds(500))
                        irPara(i, rolagem)
                    }
                }
            }
        }
        .environmentObject(player)
        .fullScreenCover(item: $pedidoCard) { CompartilharView(pedido: $0) }
        .sheet(isPresented: $sobreAberto) {
            if let s = extras.sobre { SobreView(slug: s.slug, celebracao: s.celebracao) }
        }
        .sheet(isPresented: $comentarioAberto) {
            if let c = extras.comentario { ComentarioInteiroView(comentario: c) }
        }
        .task {
            await Avisos.reagendar()
            if let i = await Servidor.compartilhado.indice() {
                destaques = Dictionary(i.destaques.map { ($0.data, $0) }, uniquingKeysWith: { a, _ in a })
                if let a = i.inicio, let b = i.fim { limites = (a, b) }
            }
        }
    }

    // MARK: Barra de leituras

    /// Há leituras no dia ao lado? (sem o índice, deixa andar)
    private func existe(_ n: Int) -> Bool {
        guard let l = limites, let d = Calendar.current.date(byAdding: .day, value: n, to: data) else { return true }
        let k = Datas.chave(d)
        return k >= l.0 && k <= l.1
    }

    /// A aba ativa é a última leitura cujo topo já passou de 40% da altura visível
    /// (o IntersectionObserver do site: logo abaixo do alto, até a metade da tela).
    private func acompanhar(_ topos: [Int: CGFloat]) {
        guard Date() >= travadaAte, !topos.isEmpty else { return }
        let limite = alturaVisivel * 0.4
        let i = topos.filter { $0.value <= limite }.keys.max() ?? 0
        if i != ativa { withAnimation(molaLuz) { ativa = i } }
    }

    /// Toque numa aba: a luz vai já até ela e a rolagem não a mexe até chegar (luzAoToque do site).
    private func irPara(_ i: Int, _ rolagem: ScrollViewProxy) {
        guard abas.indices.contains(i) else { return }
        travadaAte = Date().addingTimeInterval(1.2)
        withAnimation(molaLuz) { ativa = i }
        withAnimation(.easeInOut(duration: 0.55)) {
            rolagem.scrollTo("aba-\(i)", anchor: UnitPoint(x: 0.5, y: 0.03))
        }
    }

    /// Depuração: `-abrirCompartilhar evangelho|trecho|santo|sobre|comentario` abre a janela ao carregar.
    private func abrirDepuracao(_ d: Dia) {
        let q = UserDefaults.standard.string(forKey: "abrirCompartilhar") ?? ""
        switch q {
        case "santo": compartilharSanto()
        case "sobre": sobreAberto = extras.sobre != nil
        case "comentario": comentarioAberto = extras.comentario != nil
        default:
            if let l = d.leituras.first(where: { $0.tipo == (q == "trecho" || q.isEmpty ? "evangelho" : q) && !$0.alternativa }) {
                compartilhar(l, d)
            }
        }
    }

    private func indiceDaAba(_ nome: String) -> Int? {
        if let n = Int(nome) { return n }
        switch nome {
        case "primeira": return abas.firstIndex { $0.leitura.tipo == "leitura" }
        case "segunda":
            let ls = abas.indices.filter { abas[$0].leitura.tipo == "leitura" }
            return ls.count > 1 ? ls[1] : nil
        default: return abas.firstIndex { $0.leitura.tipo == nome }
        }
    }

    // MARK: Cabeçalho (.lp-cabeca)

    private var cabecalho: some View {
        let (linha, nome) = Cabecalho.linhas(data, dia)
        return VStack(alignment: .leading, spacing: 0) {
            Text("Liturgia Diária").font(Estilo.titulo(15.6)).tracking(-0.16)
                .foregroundStyle(CorLiturgica.titulo(dia?.cor ?? "branco"))
                .padding(.top, 18)
            Text(Cabecalho.dataCurta(data)).font(Estilo.titulo(68)).tracking(-1.56)
                .foregroundStyle(Estilo.tinta).padding(.top, 2)
                .accessibilityLabel(Datas.longa(data))
            Text(linha).font(Estilo.leitura(12.2)).foregroundStyle(Estilo.suave).padding(.top, 6)
            if !nome.isEmpty || extras.santo != nil {
                NomeDoDia(nome: nome, santo: extras.santo, saibaMais: extras.sobre != nil && !nome.isEmpty,
                          abrirSobre: { sobreAberto = true },
                          compartilharSanto: compartilharSanto)
                    .padding(.top, 12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Leituras

    @ViewBuilder private var conteudo: some View {
        if let dia {
            let bs = dia.blocos
            VStack(alignment: .leading, spacing: 0) {
                if let r = extras.resumo {
                    ResumoView(texto: r, hoje: Calendar.current.isDateInToday(data), cor: dia.cor)
                        .padding(.bottom, 44)
                        .id("resumo")
                }
                ForEach(Array(bs.enumerated()), id: \.element.id) { i, b in
                    if i > 0 { Divisor() }
                    let aba = bs[..<i].filter(\.temAba).count
                    VStack(alignment: .leading, spacing: 0) {
                        if b.temAba {   // âncora da aba (scrollTo) e posição para a aba ativa
                            Color.clear.frame(height: 0).id("aba-\(aba)")
                                .background(GeometryReader { g in
                                    Color.clear.preference(key: PosicoesAbas.self,
                                                           value: [aba: g.frame(in: .named("rolagem")).minY])
                                })
                        }
                        LeituraView(leitura: b.leitura, dia: dia,
                                    audio: b.leitura.nomeAudio(entre: dia.leituras).flatMap { audios.contains($0) ? $0 : nil },
                                    compartilhar: podeCompartilhar(b.leitura) ? { compartilhar(b.leitura, dia) } : nil)
                        ForEach(b.alternativas) { l in
                            if l.id == bs.flatMap(\.alternativas).first?.id { Color.clear.frame(height: 0).id("alternativa") }
                            Alternativa(leitura: l, dia: dia)
                        }
                        if b.leitura.tipo == "evangelho", !b.leitura.alternativa, let c = extras.comentario,
                           bs.firstIndex(where: { $0.leitura.tipo == "evangelho" }) == i {
                            ComentarioView(comentario: c, abrirInteiro: { comentarioAberto = true })
                                .padding(.top, 48)
                                .id("comentario")
                        }
                    }
                }
            }
            .padding(.top, 56)
        } else if erro {
            VStack(alignment: .leading, spacing: 12) {
                Text("Sem conexão").font(Estilo.titulo(32)).foregroundStyle(Estilo.tinta)
                Text("Não foi possível carregar as leituras deste dia.").font(Estilo.leitura(16)).foregroundStyle(Estilo.texto)
                Button("TENTAR DE NOVO") { Task { await carregar() } }
                    .font(Estilo.sans(11, .semibold)).kerning(0.9).foregroundStyle(Estilo.vermelho)
            }
            .padding(.top, 56)
        } else {
            Text("Buscando leituras do dia…").font(Estilo.leituraItalico(16)).foregroundStyle(Estilo.suave)
                .frame(maxWidth: .infinity).padding(.top, 80)
        }
    }

    /// .lp-dias: dia anterior e próximo, no pé da página.
    private func outrosDias(_ rolagem: ScrollViewProxy) -> some View {
        HStack {
            Button { mover(-1); rolagem.scrollTo("topo") } label: {
                Text("← " + Cabecalho.dataCurta(Calendar.current.date(byAdding: .day, value: -1, to: data)!))
            }.accessibilityLabel("Dia anterior")
            Spacer()
            Button { mover(1); rolagem.scrollTo("topo") } label: {
                Text(Cabecalho.dataCurta(Calendar.current.date(byAdding: .day, value: 1, to: data)!) + " →")
            }.accessibilityLabel("Próximo dia")
        }
        .font(Estilo.titulo(24)).foregroundStyle(Estilo.tinta)
        .padding(.top, 64)
        .opacity(dia == nil ? 0 : 1)
    }

    // MARK: Compartilhar (botoesDeCompartilhar e compartilharSanto do site)

    private func podeCompartilhar(_ l: Leitura) -> Bool {
        !l.alternativa && ["leitura", "salmo", "evangelho"].contains(l.tipo)
    }

    private func compartilhar(_ l: Leitura, _ dia: Dia) {
        let trecho = extras.trechos?.trechos?[l.referencia] ?? ""
        let fotos = extras.catalogo?.escolher(tempo: dia.tempo, cor: dia.cor, dt: dia.data,
                                              preferida: extras.trechos?.imagens?[l.referencia]) ?? []
        let ref = l.referencia.replacingOccurrences(of: #"\s*\(R\..*\)$"#, with: "", options: .regularExpression)
        pedidoCard = PedidoCard(
            conteudo: ConteudoCard(dt: dia.data, trecho: trecho, referencia: ref, rotulo: l.rotulo,
                                   dataCurta: Cabecalho.dataCurta(data), cor: dia.cor),
            dia: dia, leitura: l, fotos: fotos, selo: nil)
    }

    private func compartilharSanto() {
        guard let dia, let s = extras.santo else { return }
        let fotos = extras.catalogo?.escolher(tempo: dia.tempo, cor: dia.cor, dt: dia.data, preferida: s.imagem) ?? []
        pedidoCard = PedidoCard(
            conteudo: ConteudoCard(dt: dia.data, trecho: s.frase, referencia: s.nome ?? dia.celebracao, rotulo: "Santo do dia",
                                   dataCurta: Cabecalho.dataCurta(data), cor: dia.cor, aspas: true),
            dia: nil, leitura: nil, fotos: fotos, selo: "Santo do dia")
    }

    private func mover(_ n: Int) {
        player.parar()
        if let d = Calendar.current.date(byAdding: .day, value: n, to: data) { data = d }
    }

    private func carregar() async {
        dia = nil; erro = false; audios = []; ativa = 0; travadaAte = .distantPast; extras = ExtrasDoDia()
        player.parar()
        let alvo = chave
        do {
            let d = try await Servidor.compartilhado.dia(alvo)
            guard alvo == chave else { return }
            dia = d
            let e = await Servidor.compartilhado.extras(d)
            guard alvo == chave else { return }
            withAnimation(.easeOut(duration: 0.35)) { extras = e }
            if UserDefaults.standard.string(forKey: "abrirCompartilhar") != nil { abrirDepuracao(d) }
            for nome in ["primeira-leitura", "salmo", "segunda-leitura", "evangelho"] {
                if await Servidor.compartilhado.temAudio(dia: alvo, nome: nome), alvo == chave { audios.insert(nome) }
            }
        } catch { if alvo == chave { erro = true } }
    }
}

/// Topo de cada leitura com aba, no espaço da rolagem.
struct PosicoesAbas: PreferenceKey {
    static let defaultValue: [Int: CGFloat] = [:]
    static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, b in b })
    }
}

/// .lp-faixa: a faixa floral (assets/img/liturgia-faixa.webp) pintada de vermelho, fixa nas
/// duas laterais. No celular cada faixa tem 56pt, 30pt fora da tela (só 26pt aparecem).
struct Moldura: View {
    var body: some View {
        GeometryReader { g in
            let largura: CGFloat = 56
            let altura = largura * 1820 / 240
            let n = Int(ceil(g.size.height / altura)) + 1
            let faixa = VStack(spacing: 0) {
                ForEach(0..<n, id: \.self) { _ in
                    Image("Faixa").resizable().interpolation(.high).frame(width: largura, height: altura)
                }
            }
            .frame(width: largura, height: g.size.height, alignment: .top).clipped()
            faixa.position(x: -30 + largura / 2, y: g.size.height / 2)
            faixa.position(x: g.size.width - 26 + largura / 2, y: g.size.height / 2)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// .lp-fita: a fita marcadora que desce do alto da página, na cor litúrgica.
struct Fita: View {
    let cor: String
    var body: some View {
        let (fundo, costura, borda) = CorLiturgica.fita(cor)
        Canvas { ctx, s in
            let sx = s.width / 30, sy = s.height / 68
            var f = Path()
            f.move(to: CGPoint(x: 0, y: -1)); f.addLine(to: CGPoint(x: 30 * sx, y: -1))
            f.addLine(to: CGPoint(x: 30 * sx, y: 68 * sy)); f.addLine(to: CGPoint(x: 15 * sx, y: 56 * sy))
            f.addLine(to: CGPoint(x: 0, y: 68 * sy)); f.closeSubpath()
            ctx.fill(f, with: .color(fundo))
            ctx.stroke(f, with: .color(borda), lineWidth: 1)
            var c = Path()
            c.move(to: CGPoint(x: 3.5 * sx, y: -1)); c.addLine(to: CGPoint(x: 3.5 * sx, y: 61 * sy))
            c.addLine(to: CGPoint(x: 15 * sx, y: 51.5 * sy)); c.addLine(to: CGPoint(x: 26.5 * sx, y: 61 * sy))
            c.addLine(to: CGPoint(x: 26.5 * sx, y: -1))
            ctx.stroke(c, with: .color(costura), style: StrokeStyle(lineWidth: 1, dash: [3, 2.5]))
        }
        .frame(width: 18, height: 42)
        .offset(y: -1)
        .accessibilityHidden(true)
    }
}
