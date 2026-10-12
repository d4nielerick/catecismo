import SwiftUI

/// A tela do dia, no desenho do site no celular: papel claro, moldura floral vermelha nas
/// laterais, fita marcadora, data grande em Times itálico, calendário e as leituras.
struct HojeView: View {
    @State private var data = Date()
    @State private var dia: Dia?
    @State private var erro = false
    @State private var audios: Set<String> = []
    @State private var avisos = Avisos.ligados()
    @State private var destaques: [String: Indice.Destaque] = [:]
    @StateObject private var player = Player()

    private var chave: String { Datas.chave(data) }

    var body: some View {
        ZStack(alignment: .top) {
            Estilo.fundo.ignoresSafeArea()
            ScrollViewReader { rolagem in
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
                    .padding(.bottom, 90)
                    .overlay(alignment: .topTrailing) { Fita(cor: dia?.cor ?? "branco").padding(.trailing, Estilo.lado) }
                }
                .scrollIndicators(.hidden)
            }
            GeometryReader { g in   // faixa de papel sob a barra de status, para o texto não passar por baixo dela
                Estilo.fundo.frame(height: g.safeAreaInsets.top).ignoresSafeArea(edges: .top)
            }.allowsHitTesting(false)
            Moldura().ignoresSafeArea()
            sino
        }
        .environmentObject(player)
        .task(id: chave) { await carregar() }
        .task {
            await Avisos.reagendar()
            if let i = await Servidor.compartilhado.indice() {
                destaques = Dictionary(i.destaques.map { ($0.data, $0) }, uniquingKeysWith: { a, _ in a })
            }
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
            if !nome.isEmpty {
                (Text(nome).font(Estilo.leituraItalico(16)).foregroundColor(Estilo.tinta)
                 + Text("  SAIBA MAIS").font(Estilo.sans(9, .semibold)).foregroundColor(Estilo.vermelho).kerning(0.72)
                    .baselineOffset(1.5))
                    .lineSpacing(5)
                    .padding(.top, 12)
                    .onTapGesture { abrirSobre() }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Leituras

    @ViewBuilder private var conteudo: some View {
        if let dia {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(dia.leituras.enumerated()), id: \.element.id) { i, l in
                    if i > 0 { Divisor() }
                    LeituraView(leitura: l, dia: dia,
                                audio: l.nomeAudio(entre: dia.leituras).flatMap { audios.contains($0) ? $0 : nil })
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

    /// Aviso das 6h: botão redondo branco no canto, como o botão de menu do site.
    private var sino: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Button { if avisos { Avisos.desligar(); avisos = false } else { Task { avisos = await Avisos.ligar() } } } label: {
                    Image(systemName: avisos ? "bell.fill" : "bell")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(avisos ? Estilo.vermelho : Estilo.tinta)
                        .frame(width: 48, height: 48)
                        .background(Circle().fill(.white).shadow(color: .black.opacity(0.1), radius: 10, y: 3))
                }
                .accessibilityLabel(avisos ? "Desligar aviso das 6h" : "Ligar aviso das 6h")
            }
        }
        .padding(.trailing, 46).padding(.bottom, 12)
    }

    private func abrirSobre() {
        if let url = URL(string: "https://santadoutrina.com/liturgiadiaria/\(chave)/") { UIApplication.shared.open(url) }
    }

    private func mover(_ n: Int) {
        player.parar()
        if let d = Calendar.current.date(byAdding: .day, value: n, to: data) { data = d }
    }

    private func carregar() async {
        dia = nil; erro = false; audios = []
        player.parar()
        let alvo = chave
        do {
            let d = try await Servidor.compartilhado.dia(alvo)
            guard alvo == chave else { return }
            dia = d
            for nome in ["primeira-leitura", "salmo", "segunda-leitura", "evangelho"] {
                if await Servidor.compartilhado.temAudio(dia: alvo, nome: nome), alvo == chave { audios.insert(nome) }
            }
        } catch { if alvo == chave { erro = true } }
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
