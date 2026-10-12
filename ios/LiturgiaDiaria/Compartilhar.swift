import SwiftUI
import UIKit
import Photos

/// O que abrir na janela de compartilhar (abrirCard do site).
struct PedidoCard: Identifiable {
    let id = UUID()
    var conteudo: ConteudoCard
    /// Com o dia e a leitura: abre em "Esta leitura" e há "Todas as leituras" e "Trecho".
    var dia: Dia?
    var leitura: Leitura?
    var fotos: [CatalogoCards.Pintura]
    /// "Santo do dia" no alto, quando o card é de uma frase do santo.
    var selo: String?
}

/// A janela escura de compartilhar (compartilhar.mjs): três modos (Esta leitura · Todas as leituras ·
/// Trecho), os layouts do trecho (Feed · Stories · Só texto), as pinturas e as ações.
struct CompartilharView: View {
    let pedido: PedidoCard
    @Environment(\.dismiss) private var fechar

    enum Modo: String, CaseIterable { case leitura = "Esta leitura", todas = "Todas as leituras", trecho = "Trecho" }

    @State private var modo: Modo = .trecho
    @State private var conteudo: ConteudoCard
    @State private var layout = 0
    @State private var pagina = 0
    @State private var foto = 0
    @State private var arte: UIImage?
    @State private var cards: [Int: UIImage] = [:]
    @State private var paginas: [Modo: [UIImage]] = [:]
    @State private var minis: [String: UIImage] = [:]
    @State private var versos: Versos?
    @State private var sel: (Int, Int)?
    @State private var escolhendo = false
    @State private var aviso = ""
    @State private var avisoVisivel = false
    @State private var geracao = 0

    private static let fundo = Color(hex: 0x17140f)
    private static let creme = Color(hex: 0xf2ead8)

    init(pedido: PedidoCard) {
        self.pedido = pedido
        var c = pedido.conteudo
        c.trecho = c.trecho.capitalizedFirst
        _conteudo = State(initialValue: c)
        _modo = State(initialValue: pedido.dia != nil && pedido.leitura != nil ? .leitura : .trecho)
        // depuração: -modoCard trecho|todas e -layoutCard 0…2
        switch UserDefaults.standard.string(forKey: "modoCard") {
        case "trecho": _modo = State(initialValue: .trecho)
        case "todas" where pedido.dia != nil: _modo = State(initialValue: .todas)
        default: break
        }
        _layout = State(initialValue: min(max(UserDefaults.standard.integer(forKey: "layoutCard"), 0), 2))
    }

    private var comPaginas: Bool { pedido.dia != nil && pedido.leitura != nil }
    private var modos: [Modo] { comPaginas ? (conteudo.trecho.isEmpty ? [.leitura, .todas] : Modo.allCases) : [] }

    var body: some View {
        ZStack {
            Self.fundo.ignoresSafeArea()
            VStack(spacing: 0) {
                topo
                if !modos.isEmpty { seletorModos.padding(.top, 6) }
                if modo == .trecho { abasLayout.padding(.top, modos.isEmpty ? 10 : 8) }
                palco.frame(maxHeight: .infinity)
                if modo == .trecho && pedido.fotos.count > 1 { fileiraFotos }
                if modo == .trecho, let v = versos, !v.vazio {
                    Button { withAnimation(.easeOut(duration: 0.28)) { escolhendo = true } } label: {
                        Text("Escolher outro trecho").font(Estilo.sans(13, .semibold)).foregroundStyle(Self.creme)
                            .padding(.horizontal, 16).padding(.vertical, 9)
                            .background(Capsule().stroke(Self.creme.opacity(0.3), lineWidth: 1))
                    }
                    .padding(.bottom, 12)
                }
                acoes
                Text(aviso).font(Estilo.sans(12.5)).foregroundStyle(Self.creme.opacity(0.75))
                    .multilineTextAlignment(.center)
                    .frame(minHeight: 18).padding(.top, 8).padding(.horizontal, 20)
                    .opacity(avisoVisivel ? 1 : 0)
                    .animation(.easeInOut(duration: 0.25), value: avisoVisivel)
            }
            .padding(.bottom, 8)
        }
        .preferredColorScheme(.dark)
        .task { await preparar() }
        .onChange(of: modo) { _, m in pagina = 0; Task { await prepararPaginas(m) } }
        // painel próprio em vez de .sheet: dentro do fullScreenCover a folha não abria no aparelho
        .overlay {
            if escolhendo, let v = versos {
                ZStack(alignment: .bottom) {
                    Color.black.opacity(0.45).ignoresSafeArea()
                        .onTapGesture { withAnimation(.easeOut(duration: 0.25)) { escolhendo = false } }
                    EscolherVersos(versos: v, sel: sel, cor: conteudo.cor,
                                   escolher: { a, b, exato in escolher(a, b, exato: exato) },
                                   pronto: { withAnimation(.easeOut(duration: 0.25)) { escolhendo = false } })
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .padding(.top, 90)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22))
                        .ignoresSafeArea(edges: .bottom)
                        .transition(.move(edge: .bottom))
                }
            }
        }
    }

    // MARK: Partes

    private var topo: some View {
        HStack {
            Text((pedido.selo ?? "Compartilhar").uppercased())
                .font(Estilo.sans(11, .semibold)).kerning(1.3)
                .foregroundStyle(pedido.selo != nil ? Estilo.vermelho.opacity(0.95) : Self.creme.opacity(0.6))
            Spacer()
            Button { fechar() } label: {
                Image(systemName: "xmark").font(.system(size: 15, weight: .medium)).foregroundStyle(Self.creme)
                    .frame(width: 44, height: 44).background(Circle().fill(Color.white.opacity(0.08)))
            }
            .accessibilityLabel("Fechar")
        }
        .padding(.leading, 20).padding(.trailing, 12)
    }

    private var seletorModos: some View {
        HStack(spacing: 2) {
            ForEach(modos, id: \.self) { m in
                Button { withAnimation(.easeOut(duration: 0.2)) { modo = m } } label: {
                    Text(m.rawValue).font(Estilo.sans(13, .semibold)).lineLimit(1)
                        .foregroundStyle(m == modo ? Color(hex: 0x1c1812) : Self.creme.opacity(0.62))
                        .padding(.horizontal, 13).padding(.vertical, 8)
                        .background(Capsule().fill(m == modo ? Self.creme : .clear))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(m == modo ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Capsule().fill(Self.creme.opacity(0.1)))
    }

    private var abasLayout: some View {
        HStack(spacing: 6) {
            ForEach(LayoutCard.allCases) { l in
                Button { withAnimation(.easeOut(duration: 0.26)) { layout = l.rawValue } } label: {
                    Text(l.nome).font(Estilo.sans(modos.isEmpty ? 13 : 12, .semibold)).kerning(0.4)
                        .foregroundStyle(l.rawValue == layout ? .white : Self.creme.opacity(0.5))
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(Capsule().fill(l.rawValue == layout ? Self.creme.opacity(0.14) : .clear))
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// O trilho de slides: o atual no meio e os vizinhos aparecendo nas bordas (arrasta-se para o lado).
    private var palco: some View {
        let imagens: [(Int, UIImage?, CGSize)] = modo == .trecho
            ? LayoutCard.allCases.map { ($0.rawValue, cards[$0.rawValue], $0.tamanho) }
            : (paginas[modo].map { ps in ps.enumerated().map { ($0.offset, Optional($0.element), $0.element.size) } }
               ?? [(0, nil, CGSize(width: 1080, height: 1920))])
        let selecao = Binding<Int?>(
            get: { modo == .trecho ? layout : pagina },
            set: { v in if let v { if modo == .trecho { layout = v } else { pagina = v } } })
        return GeometryReader { g in
            let largura = g.size.width * 0.78
            ScrollViewReader { rolar in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 14) {
                    ForEach(imagens, id: \.0) { i, img, tam in
                        let atual = i == (selecao.wrappedValue ?? 0)
                        Group {
                            if let img {
                                Image(uiImage: img).resizable().aspectRatio(contentMode: .fit)
                            } else {
                                RoundedRectangle(cornerRadius: 16).fill(Color(hex: 0x26211a))
                                    .aspectRatio(tam.width / tam.height, contentMode: .fit)
                                    .overlay(ProgressView().tint(Self.creme.opacity(0.6)))
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .shadow(color: .black.opacity(0.45), radius: 12, y: 10)
                        .frame(width: largura, height: g.size.height - 28)
                        .opacity(atual ? 1 : 0.35)
                        .scaleEffect(atual ? 1 : 0.94)
                        .animation(.easeOut(duration: 0.2), value: atual)
                        .onTapGesture { if !atual { withAnimation(.easeOut(duration: 0.26)) { selecao.wrappedValue = i } } }
                        .accessibilityLabel(modo == .trecho ? "Card \(LayoutCard(rawValue: i)!.nome)" : "Página \(i + 1) de \(imagens.count)")
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, (g.size.width - largura) / 2, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: selecao, anchor: .center)
            .padding(.vertical, 14)
            .onAppear { DispatchQueue.main.async { rolar.scrollTo(selecao.wrappedValue ?? 0, anchor: .center) } }
            }
        }
        .overlay(alignment: .bottom) {
            if modo != .trecho, let n = paginas[modo]?.count, n > 1 {
                Text("\(pagina + 1)/\(n)").font(Estilo.sans(11, .semibold)).foregroundStyle(Self.creme.opacity(0.7))
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(Capsule().fill(.black.opacity(0.55)))
                    .offset(y: 8)
            }
        }
    }

    private var fileiraFotos: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                ForEach(Array(pedido.fotos.enumerated()), id: \.element.id) { i, p in
                    Button { trocarFoto(i) } label: {
                        Group {
                            if let m = minis[p.id] { Image(uiImage: m).resizable().scaledToFill() }
                            else { Color(hex: 0x26211a) }
                        }
                        .frame(width: 44, height: 44).clipShape(Circle())
                        .overlay(Circle().stroke(Self.creme.opacity(0.2), lineWidth: 1))
                        .padding(3)
                        .overlay(Circle().stroke(i == foto ? Self.creme : .clear, lineWidth: 1.5))
                        .opacity(i == foto ? 1 : 0.6)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(p.titulo)
                    .accessibilityAddTraits(i == foto ? .isSelected : [])
                }
            }
            .padding(.horizontal, 16)
            .frame(minWidth: UIScreen.main.bounds.width)
        }
        .padding(.bottom, 12)
        .opacity(layout == LayoutCard.texto.rawValue ? 0.25 : 1)
        .allowsHitTesting(layout != LayoutCard.texto.rawValue)
    }

    private var acoes: some View {
        HStack(spacing: 26) {
            acao("WhatsApp", IconeWhatsApp()) { enviar(.whatsapp) }
            acao("Instagram", IconeInstagram()) { enviar(.instagram) }
            acao("Salvar", IconeSalvar()) { enviar(.salvar) }
            acao("Mais", Image(systemName: "ellipsis").font(.system(size: 19, weight: .light))) { enviar(.mais) }
        }
    }

    private func acao<I: View>(_ nome: String, _ icone: I, _ f: @escaping () -> Void) -> some View {
        Button(action: f) {
            VStack(spacing: 8) {
                icone.foregroundStyle(Self.creme).frame(width: 23, height: 23)
                    .frame(width: 52, height: 52)
                    .overlay(Circle().stroke(Self.creme.opacity(0.28), lineWidth: 1))
                    .contentShape(Circle())
                Text(nome).font(Estilo.leituraItalico(13.5)).foregroundStyle(Self.creme.opacity(0.65))
            }
        }
        .buttonStyle(Afunda())
        .accessibilityLabel(nome)
    }

    // MARK: Desenho

    private func preparar() async {
        if let l = pedido.leitura {
            let v = Versos(leitura: l, referencia: pedido.conteudo.referencia, completa: l.referencia)
            if !v.vazio {
                versos = v
                if !conteudo.trecho.isEmpty, let s = v.achar(conteudo.trecho) { sel = s }
                else if conteudo.trecho.isEmpty {
                    let s = v.efetivo(0, 0)
                    sel = s
                    conteudo.trecho = v.texto(s.0, s.1)
                    conteudo.referencia = v.referencia(s.0, s.1)
                }
            }
        }
        if comPaginas { await prepararPaginas(modo) }
        if UserDefaults.standard.bool(forKey: "escolherTrecho"), versos != nil { escolhendo = true }   // depuração
        if let p = pedido.fotos.first { arte = await Servidor.compartilhado.imagem(p.caminho) }
        await desenharCards()
        if let a = UserDefaults.standard.string(forKey: "acaoCard") {   // depuração: -acaoCard mais|salvar|instagram
            try? await Task.sleep(for: .milliseconds(600))
            enviar(a == "salvar" ? .salvar : a == "instagram" ? .instagram : .mais)
        }
        for p in pedido.fotos {
            if let m = await Servidor.compartilhado.imagem(p.mini) { minis[p.id] = m }
        }
    }

    private func desenharCards() async {
        geracao += 1
        let vez = geracao
        let c = conteudo, a = arte
        let novos = await Task.detached(priority: .userInitiated) {
            Dictionary(uniqueKeysWithValues: LayoutCard.allCases.map { ($0.rawValue, Cards.card($0, c, arte: a)) })
        }.value
        if vez == geracao { cards = novos }
    }

    private func prepararPaginas(_ m: Modo) async {
        guard m != .trecho, paginas[m] == nil, let dia = pedido.dia else { return }
        let ref = m == .leitura ? pedido.leitura?.referencia : nil
        let pintura = await Servidor.compartilhado.imagem("assets/img/cards/trigo-colina.webp")
        let ps = await Task.detached(priority: .userInitiated) { PaginasDoDia.paginas(dia, referencia: ref, pintura: pintura) }.value
        paginas[m] = ps
    }

    private func trocarFoto(_ i: Int) {
        foto = i
        let p = pedido.fotos[i]
        Task {
            arte = await Servidor.compartilhado.imagem(p.caminho)
            guard foto == i else { return }
            await desenharCards()
        }
    }

    private func escolher(_ a: Int, _ b: Int, exato: Bool = false) {
        guard let v = versos else { return }
        let s = exato ? (a, b) : v.efetivo(a, v.unidades[a].n == "R." ? a : b)
        let t = v.texto(s.0, s.1)
        sel = s
        guard t.count <= Versos.maximo else { return }
        conteudo.trecho = t
        conteudo.referencia = v.referencia(s.0, s.1)
        cards = [:]
        Task { await desenharCards() }
    }

    // MARK: Enviar

    enum Destino { case whatsapp, instagram, salvar, mais }

    private var link: URL { URL(string: "https://\(Cards.site)/\(conteudo.dt)/")! }

    /// As imagens do modo atual, como arquivos com nome (é o nome que aparece no WhatsApp e nas Fotos).
    private func arquivos() -> [URL] {
        let pasta = FileManager.default.temporaryDirectory.appendingPathComponent("cards", isDirectory: true)
        try? FileManager.default.createDirectory(at: pasta, withIntermediateDirectories: true)
        if modo == .trecho {
            guard let img = cards[layout], let png = img.pngData() else { return [] }
            let u = pasta.appendingPathComponent("liturgia-\(conteudo.dt)-\(LayoutCard(rawValue: layout)!.arquivo).png")
            try? png.write(to: u)
            return [u]
        }
        return (paginas[modo] ?? []).enumerated().compactMap { i, img in
            guard let j = img.jpegData(compressionQuality: 0.9) else { return nil }
            let u = pasta.appendingPathComponent("liturgia-\(conteudo.dt)-\(modo == .todas ? "leituras" : "leitura")-\(i + 1).jpg")
            try? j.write(to: u)
            return u
        }
    }

    private func enviar(_ destino: Destino) {
        let texto = "“\(conteudo.trecho)” (\(conteudo.referencia))\n\(link.absoluteString)"
        switch destino {
        case .whatsapp where modo == .trecho:
            // como no site: o trecho e o link (a prévia do link mostra a imagem do dia)
            let q = texto.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            let app = URL(string: "whatsapp://send?text=\(q)")!
            UIApplication.shared.open(app) { ok in
                if !ok, let web = URL(string: "https://wa.me/?text=\(q)") { UIApplication.shared.open(web) }
            }
        case .whatsapp:
            avisar("Escolha o WhatsApp na lista.")
            Folha.apresentar(arquivos())
        case .instagram:
            avisar(modo == .trecho ? "Escolha o Instagram e depois “Stories” ou “Feed”." : "Escolha o Instagram na lista.")
            Folha.apresentar(arquivos())
        case .salvar:
            salvarNasFotos()
        case .mais:
            Folha.apresentar(arquivos() as [Any] + [modo == .trecho ? texto : "Liturgia Diária · \(link.absoluteString)"])
        }
    }

    private func salvarNasFotos() {
        let urls = arquivos()
        guard !urls.isEmpty else { return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { estado in
            guard estado == .authorized || estado == .limited else {
                Task { @MainActor in avisar("Permita o acesso às Fotos nos Ajustes para salvar.") }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                for u in urls { PHAssetCreationRequest.creationRequestForAssetFromImage(atFileURL: u) }
            }) { ok, _ in
                Task { @MainActor in
                    avisar(ok ? (urls.count > 1 ? "\(urls.count) imagens salvas nas Fotos." : "Imagem salva nas Fotos.") : "Não foi possível salvar.")
                    if ok { UINotificationFeedbackGenerator().notificationOccurred(.success) }
                }
            }
        }
    }

    private func avisar(_ m: String) {
        aviso = m
        avisoVisivel = true
        let agora = m
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { if aviso == agora { avisoVisivel = false } }
    }
}

/// A folha de compartilhar do sistema, por cima do que estiver aberto.
enum Folha {
    @MainActor static func apresentar(_ itens: [Any]) {
        guard !itens.isEmpty,
              let cena = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              var topo = cena.keyWindow?.rootViewController else { return }
        while let p = topo.presentedViewController { topo = p }
        let vc = UIActivityViewController(activityItems: itens, applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = topo.view
        topo.present(vc, animated: true)
    }
}

// MARK: Escolher o trecho

/// A leitura em versículos: tocar escolhe um; segurar e arrastar (ou segurar e tocar no último) escolhe vários.
struct EscolherVersos: View {
    let versos: Versos
    @State var sel: (Int, Int)?
    let cor: String
    var escolher: (Int, Int, Bool) -> Void   // (início, fim, exato)
    var pronto: () -> Void
    @State private var quadros: [Int: CGRect] = [:]

    private var marcados: (Int, Int)? { sel }
    private var textoSel: String { sel.map { versos.texto($0.0, $0.1) } ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Escolha o trecho").font(Estilo.titulo(24)).foregroundStyle(Estilo.tinta)
                    Text("Toque num versículo; use + e − para aumentar ou diminuir o trecho")
                        .font(Estilo.sans(12.5)).foregroundStyle(Estilo.suave)
                }
                Spacer()
                Button("Pronto") { pronto() }.font(Estilo.sans(15, .semibold)).foregroundStyle(Estilo.vermelho)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 22).padding(.top, 22).padding(.bottom, 12)
            ScrollViewReader { rolar in
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(versos.unidades) { u in linha(u).id(u.id) }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                    .coordinateSpace(name: "versos")
                    .onPreferenceChange(QuadrosVersos.self) { quadros = $0 }
                }
                .onAppear { if let s = sel { rolar.scrollTo(s.0, anchor: .center) } }
            }
            let longo = textoSel.count > Versos.maximo
            Text(textoSel.isEmpty ? "" : longo ? "Longo demais para o card: \(textoSel.count)/\(Versos.maximo) letras" : "\(textoSel.count)/\(Versos.maximo) letras")
                .font(Estilo.sans(12, longo ? .semibold : .regular))
                .foregroundStyle(longo ? Estilo.vermelho : Estilo.suave)
                .frame(maxWidth: .infinity).padding(.vertical, 10)
        }
        .background(Estilo.fundo)
        .preferredColorScheme(.light)
    }

    private func linha(_ u: Versos.Unidade) -> some View {
        let marcado = (marcados.map { u.id >= min($0.0, $0.1) && u.id <= max($0.0, $0.1) } ?? false)
        return HStack(alignment: .center, spacing: 6) {
            (Text(u.n + "\u{2009}").font(Estilo.leitura(11)).foregroundColor(Estilo.vermelho).baselineOffset(5)
             + Text(u.texto).font(u.n == "R." ? Estilo.leituraItalico(16) : Estilo.leitura(16)).foregroundColor(Estilo.tinta.opacity(0.78)))
                .lineSpacing(5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture { aplicar(u.id, u.id); UISelectionFeedbackGenerator().selectionChanged() }
            botao(u).frame(width: 34)
        }
        .padding(.leading, 8).padding(.trailing, 2).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 6).fill(marcado ? Color(hex: 0xf3d58c, alpha: 0.55) : .clear))
        .animation(.easeOut(duration: 0.15), value: marcado)
        .background(GeometryReader { g in Color.clear.preference(key: QuadrosVersos.self, value: [u.id: g.frame(in: .named("versos"))]) })
        .accessibilityAddTraits(.isButton)
        .accessibilityAddTraits(marcado ? .isSelected : [])
    }

    /// "+" no versículo vizinho do trecho (acrescenta) e "−" nas pontas do trecho (tira).
    @ViewBuilder private func botao(_ u: Versos.Unidade) -> some View {
        if let s = sel, versos.unidades[s.0].n != "R.", u.n != "R." {
            let (a, b) = (min(s.0, s.1), max(s.0, s.1))
            if u.id == a - 1 || u.id == b + 1 {
                Button { ajustar(min(a, u.id), max(b, u.id)) } label: {
                    Image(systemName: "plus.circle.fill").font(.system(size: 24)).foregroundStyle(Estilo.vermelho)
                }
                .accessibilityLabel("Acrescentar o versículo \(u.n)")
            } else if a != b && (u.id == a || u.id == b) {
                Button { ajustar(u.id == a ? a + 1 : a, u.id == b ? b - 1 : b) } label: {
                    Image(systemName: "minus.circle.fill").font(.system(size: 24)).foregroundStyle(Estilo.suave)
                }
                .accessibilityLabel("Tirar o versículo \(u.n)")
            }
        }
    }

    /// Toque no texto: escolhe o versículo (completando a frase, como no site).
    private func aplicar(_ a: Int, _ b: Int) {
        let s = versos.efetivo(a, versos.unidades[a].n == "R." ? a : b)
        sel = s
        escolher(s.0, s.1, true)
    }

    /// + e −: exatamente o que a pessoa pediu.
    private func ajustar(_ a: Int, _ b: Int) {
        sel = (a, b)
        escolher(a, b, true)
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

struct QuadrosVersos: PreferenceKey {
    static let defaultValue: [Int: CGRect] = [:]
    static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) { value.merge(nextValue()) { $1 } }
}

// MARK: Ícones das ações (compartilhar.mjs → ICONE, traço 1.3 em 24×24)

struct IconeWhatsApp: View {
    var body: some View {
        GeometryReader { g in
            let s = g.size.width / 24
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: 3.6 * s, y: 20.4 * s))
                    p.addLine(to: CGPoint(x: 4.8 * s, y: 16.3 * s))
                    p.addRelativeArc(center: CGPoint(x: 12 * s, y: 12 * s), radius: 8.4 * s,
                                     startAngle: .degrees(149.2), delta: .degrees(328.8))
                    p.closeSubpath()
                }
                .stroke(style: StrokeStyle(lineWidth: 1.3 * s * 1.1, lineCap: .round, lineJoin: .round))
                Image(systemName: "phone").font(.system(size: 9 * s, weight: .light)).offset(x: 0.3 * s, y: 0)
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

struct IconeInstagram: View {
    var body: some View {
        GeometryReader { g in
            let s = g.size.width / 24
            ZStack {
                RoundedRectangle(cornerRadius: 4.8 * s).stroke(lineWidth: 1.4 * s)
                    .frame(width: 17 * s, height: 17 * s)
                Circle().stroke(lineWidth: 1.4 * s).frame(width: 7.8 * s, height: 7.8 * s)
                Circle().frame(width: 1.4 * s, height: 1.4 * s).position(x: 17.2 * s, y: 6.8 * s)
            }
            .frame(width: g.size.width, height: g.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

struct IconeSalvar: View {
    var body: some View {
        GeometryReader { g in
            let s = g.size.width / 24
            Path { p in
                p.move(to: CGPoint(x: 12 * s, y: 4.5 * s)); p.addLine(to: CGPoint(x: 12 * s, y: 14.5 * s))
                p.move(to: CGPoint(x: 7.8 * s, y: 10.6 * s)); p.addLine(to: CGPoint(x: 12 * s, y: 14.8 * s)); p.addLine(to: CGPoint(x: 16.2 * s, y: 10.6 * s))
                p.move(to: CGPoint(x: 5 * s, y: 19.5 * s)); p.addLine(to: CGPoint(x: 19 * s, y: 19.5 * s))
            }
            .stroke(style: StrokeStyle(lineWidth: 1.4 * s, lineCap: .round, lineJoin: .round))
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

/// O ícone de compartilhar das leituras (.lp-compartilhar): caixa aberta com a seta para cima.
struct IconeCompartilhar: Shape {
    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
        var c = Path()
        c.move(to: p(12, 14)); c.addLine(to: p(12, 3.5))
        c.move(to: p(8, 7.5)); c.addLine(to: p(12, 3.5)); c.addLine(to: p(16, 7.5))
        c.move(to: p(8.5, 10.5)); c.addLine(to: p(7, 10.5))
        c.addQuadCurve(to: p(5, 12.5), control: p(5, 10.5))
        c.addLine(to: p(5, 19)); c.addQuadCurve(to: p(7, 21), control: p(5, 21))
        c.addLine(to: p(17, 21)); c.addQuadCurve(to: p(19, 19), control: p(19, 21))
        c.addLine(to: p(19, 12.5)); c.addQuadCurve(to: p(17, 10.5), control: p(19, 10.5))
        c.addLine(to: p(15.5, 10.5))
        return c
    }
}
