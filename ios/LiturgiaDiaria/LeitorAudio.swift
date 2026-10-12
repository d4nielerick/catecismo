import SwiftUI
import UIKit

/// A tela de ouvir do site (leitor-audio.mjs + .lp-ouvir em liturgiadiaria.css), no estilo "Letras"
/// do Apple Music: só o texto, em letra grande; a linha que está sendo lida acesa, as já lidas
/// esmaecendo, as próximas mais apagadas, e a rolagem acompanhando a voz. Tocar numa linha pula o
/// áudio para ela. Os controles somem sozinhos enquanto toca e voltam a um toque.
struct LeitorAudioView: View {
    @EnvironmentObject var player: Player
    @Environment(\.accessibilityReduceMotion) private var reduzido

    @State private var quieto = false            // .lp-ouvir-quieto: topo e controles apagados
    @State private var esperaControles: Task<Void, Never>?
    @State private var entrou = false            // lp-ouvir-sobe: o texto chega logo depois da folha
    @State private var maoAte = Date.distantPast // até quando a rolagem é da pessoa
    @State private var fimVisivel = false        // "Pular para o Salmo ›"
    @State private var alturaCaixa: CGFloat = 600

    var body: some View {
        GeometryReader { g in
            let altTela = g.size.height + g.safeAreaInsets.top + g.safeAreaInsets.bottom
            ZStack {
                Fundo(cor: player.cor).ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { mostrarControles() }
                VStack(spacing: 0) {
                    topo
                        .opacity(quieto ? 0 : 1)
                        .modifier(Sobe(entrou: entrou, atraso: 0.3, reduzido: reduzido))
                    texto(largura: g.size.width, altTela: altTela)
                        .opacity(player.esperando ? 0.6 : 1)
                        .animation(.easeInOut(duration: 0.3), value: player.esperando)
                        .modifier(Sobe(entrou: entrou, atraso: 0.3, reduzido: reduzido))
                    controles
                        .opacity(quieto ? 0 : 1)
                        .modifier(Sobe(entrou: entrou, atraso: 0.38, reduzido: reduzido))
                }
                .overlay(alignment: .bottom) { avisoOuPular.padding(.bottom, 168) }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            entrou = true
            mostrarControles()
        }
        .onChange(of: player.tocando) { mostrarControles() }
        .onChange(of: player.aviso) { _, a in if a != nil { withAnimation(.easeInOut(duration: 0.5)) { quieto = false } } }
        .onChange(of: player.geracao) { fimVisivel = false; maoAte = .distantPast }
        .accessibilityAction(.magicTap) { player.alternar() }
    }

    // MARK: Topo (.lp-ouvir-topo)

    private var topo: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 1.6) {
                Text(rotulo)
                    .font(.system(size: 10.9, weight: .semibold)).kerning(1.3).textCase(.uppercase)
                    .foregroundStyle(.white.opacity(0.55))
                Text(referencia)
                    .font(Estilo.leituraItalico(16)).foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
            Button { player.parar() } label: {
                Image(systemName: "xmark").font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.white.opacity(0.1)))
            }
            .buttonStyle(Afunda())
            .accessibilityLabel("Fechar")
        }
        .padding(.leading, 22.4).padding(.trailing, 16).padding(.top, 4).padding(.bottom, 8)
        .animation(.easeInOut(duration: 0.5), value: quieto)
    }

    private var rotulo: String {
        guard let item = player.item else { return "" }
        return player.fila.count > 1 ? "\(item.rotulo) · \(player.pos + 1) de \(player.fila.count)" : item.rotulo
    }

    /// Sem a nota do refrão ("(R. …)").
    private var referencia: String {
        (player.dados?.referencia ?? " ").replacingOccurrences(of: #"\s*\(R\..*\)$"#, with: "", options: .regularExpression)
    }

    // MARK: O texto (.lp-ouvir-texto)

    private func texto(largura: CGFloat, altTela: CGFloat) -> some View {
        let tamanho = min(max(24.8, largura * 0.07), 38.4)          // clamp(1.55rem, 7vw, 2.4rem)
        let tamRubrica = min(max(12.48, largura * 0.034), 15.2)     // clamp(0.78rem, 3.4vw, 0.95rem)
        let linhas = player.dados?.linhas ?? []
        return ScrollViewReader { rolagem in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(linhas.enumerated()), id: \.offset) { i, l in
                        LinhaOuvir(texto: l.texto, tipo: tipo(l, i, linhas), atual: i == player.atual, lida: i < player.atual,
                                   ultima: i == linhas.count - 1, tamanho: tamanho, tamRubrica: tamRubrica, reduzido: reduzido)
                            .id(i)
                            .onTapGesture { player.ir(linha: i); mostrarControles() }
                    }
                }
                .frame(maxWidth: 544, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, altTela * 0.30)
                .padding(.bottom, altTela * 0.45)
                .background(GeometryReader { c in
                    Color.clear.preference(key: RolagemOuvir.self,
                                           value: RolagemOuvir.Valor(topo: -c.frame(in: .named("caixa")).minY, altura: c.size.height))
                })
                .id(player.geracao)   // leitura nova: o texto volta ao começo
            }
            .coordinateSpace(name: "caixa")
            .background(GeometryReader { c in
                Color.clear.onAppear { alturaCaixa = c.size.height }
                    .onChange(of: c.size.height) { _, h in alturaCaixa = h }
            })
            .modifier(MaoNaRolagem { maoAte = Date().addingTimeInterval(4) })
            .onPreferenceChange(RolagemOuvir.self) { v in
                // no fim do texto, rolado com a mão, aparece o atalho para a próxima leitura
                guard Date() < maoAte else { return }
                let fim = v.topo + alturaCaixa >= v.altura - alturaCaixa * 0.55
                let mostrar = fim && player.proxima != nil && player.aviso == nil
                if mostrar != fimVisivel { withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { fimVisivel = mostrar } }
            }
            .onChange(of: player.atual) { _, i in
                guard i >= 0, Date() >= maoAte else { return }
                // a linha atual fica um pouco acima do meio (38% da caixa), como no site
                withAnimation(reduzido ? nil : .timingCurve(0.25, 0.1, 0.25, 1, duration: 0.6)) {
                    rolagem.scrollTo(i, anchor: UnitPoint(x: 0, y: 0.38))
                }
            }
            .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.18),
                                         .init(color: .black, location: 0.72), .init(color: .clear, location: 1)],
                                 startPoint: .top, endPoint: .bottom))
        }
    }

    /// Hierarquia: abertura e fecho litúrgicos como rubrica; refrão do salmo em destaque próprio.
    private func tipo(_ l: AudioLeitura.Linha, _ i: Int, _ ls: [AudioLeitura.Linha]) -> LinhaOuvir.Tipo {
        if i == 0 || (i == ls.count - 1 && l.texto.range(of: #"^Palavra d[ao] "#, options: .regularExpression) != nil) { return .rubrica }
        if player.item?.nome == "salmo", ls.count > 1, l.texto == ls[1].texto { return .refrao }
        return .normal
    }

    // MARK: Controles (.lp-ouvir-controles)

    private var controles: some View {
        VStack(spacing: 0) {
            BarraProgresso().padding(.bottom, 17.6)
            HStack(spacing: 0) {
                botao("music.note", rotulo: "Música de fundo") { player.alternarMusica() }
                    .opacity(player.musicaLigada ? 1 : 0.35)
                botao("gobackward.15", rotulo: "Voltar 15 segundos") { player.pular(-15) }
                Button { player.alternar(); mostrarControles() } label: {
                    ZStack {
                        Circle().fill(.white)
                        Image(systemName: player.tocando ? "pause.fill" : "play.fill")
                            .font(.system(size: 25, weight: .regular))
                            .foregroundStyle(Color(hex: 0x0d0a07))
                            .offset(x: player.tocando ? 0 : 2)
                            .contentTransition(.symbolEffect(.replace))
                        if player.esperando { AnelEsperando() }
                    }
                    .frame(width: 68, height: 68)
                }
                .buttonStyle(Afunda())
                .frame(maxWidth: .infinity)
                .accessibilityLabel(player.tocando ? "Pausar" : "Tocar")
                botao("goforward.15", rotulo: "Avançar 15 segundos") { player.pular(15) }
                Color.clear.frame(width: 52, height: 52).frame(maxWidth: .infinity)   // .lp-ouvir-vao
            }
            .frame(maxWidth: 420)
        }
        .padding(.horizontal, 22.4).padding(.top, 8).padding(.bottom, 6)
        .animation(.easeInOut(duration: 0.5), value: quieto)
    }

    private func botao(_ simbolo: String, rotulo: String, _ acao: @escaping () -> Void) -> some View {
        Button { acao(); mostrarControles() } label: {
            Image(systemName: simbolo).font(.system(size: 22, weight: .regular))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .contentShape(Circle())
        }
        .buttonStyle(Afunda())
        .frame(maxWidth: .infinity)
        .accessibilityLabel(rotulo)
    }

    // MARK: Aviso do fim e atalho para a próxima

    @ViewBuilder private var avisoOuPular: some View {
        if let a = player.aviso {
            AvisoFimView(aviso: a) { player.escolher($0) }
                .transition(.opacity.combined(with: .offset(y: 12)).combined(with: .scale(scale: 0.97)))
        } else if fimVisivel, let p = player.proxima {
            Button {
                fimVisivel = false
                player.pularParaProxima()
            } label: {
                Text("Pular para \(p.comArtigo) ›")
                    .font(.system(size: 13.6, weight: .semibold)).foregroundStyle(Color(hex: 0x0d0a07))
                    .padding(.vertical, 12).padding(.horizontal, 20.8)
                    .background(Capsule().fill(.white))
                    .shadow(color: .black.opacity(0.4), radius: 15, y: 10)
            }
            .buttonStyle(Afunda())
            .transition(.opacity.combined(with: .offset(y: 12)).combined(with: .scale(scale: 0.97)))
        }
    }

    /// Os controles somem 3 s depois do último toque, enquanto a voz toca.
    private func mostrarControles() {
        if quieto { withAnimation(.easeInOut(duration: 0.5)) { quieto = false } }
        esperaControles?.cancel()
        esperaControles = Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled, player.tocando, player.aviso == nil else { return }
            withAnimation(.easeInOut(duration: 0.5)) { quieto = true }
        }
    }
}

// MARK: - Peças

/// Uma linha do texto, com os estados do site: próxima (28%), lida (40%), atual (branca, sem
/// desfoque, escala cheia). Rubrica em versalete sem serifa; refrão do salmo em itálico dourado.
struct LinhaOuvir: View {
    enum Tipo { case normal, rubrica, refrao }
    let texto: String
    let tipo: Tipo
    let atual: Bool
    let lida: Bool
    let ultima: Bool
    let tamanho: CGFloat
    let tamRubrica: CGFloat
    let reduzido: Bool

    var body: some View {
        Text(texto)
            .font(fonte)
            .kerning(tipo == .rubrica ? tamRubrica * 0.14 : 0)
            .textCase(tipo == .rubrica ? .uppercase : nil)
            .lineSpacing(tipo == .rubrica ? tamRubrica * 0.3 : tamanho * 0.02)   // line-height 1.5 e 1.22
            .foregroundStyle(cor)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .scaleEffect(atual || reduzido ? 1 : 0.96, anchor: .leading)
            .blur(radius: atual || reduzido || tipo == .rubrica ? 0 : 0.6)
            .padding(.top, margemTopo)
            .padding(.bottom, margemBaixo)
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.45), value: atual)
            .animation(.easeOut(duration: 0.45), value: lida)
            .animation(reduzido ? nil : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.6), value: atual)
            .accessibilityAddTraits(atual ? .isSelected : [])
    }

    private var fonte: Font {
        switch tipo {
        case .normal: return .custom("InriaSerif-Bold", fixedSize: tamanho)
        case .refrao: return .custom("InriaSerif-Italic", fixedSize: tamanho)
        case .rubrica: return .system(size: tamRubrica, weight: .semibold)
        }
    }

    private var cor: Color {
        if atual {
            switch tipo {
            case .rubrica: return .white.opacity(0.92)
            case .refrao: return Color(hex: 0xf1d38b)
            case .normal: return .white
            }
        }
        return .white.opacity(lida ? 0.4 : 0.28)
    }

    private var margemTopo: CGFloat {
        switch tipo {
        case .rubrica: return tamRubrica * (ultima ? 1.6 : 0.4)
        case .refrao: return tamanho * 0.3
        case .normal: return 0
        }
    }

    private var margemBaixo: CGFloat {
        switch tipo {
        case .rubrica: return tamRubrica * 1.4
        case .refrao: return tamanho * 1
        case .normal: return tamanho * 0.55
        }
    }
}

/// Fundo da tela: a cor litúrgica do dia escurecida, com uma luz no alto à esquerda.
/// radial-gradient(120% 80% at 20% 0%, cor 70% + preto, transparente 70%) sobre
/// linear-gradient(170deg, cor 45% + #120e0a, #0d0a07 75%).
private struct Fundo: View {
    let cor: Color
    var body: some View {
        ZStack {
            LinearGradient(stops: [.init(color: misturar(cor, 0.45, 0x120e0a), location: 0),
                                   .init(color: Color(hex: 0x0d0a07), location: 0.75)],
                           startPoint: UnitPoint(x: 0.41, y: 0), endPoint: UnitPoint(x: 0.59, y: 1))
            EllipticalGradient(stops: [.init(color: misturar(cor, 0.7, 0x000000), location: 0),
                                       .init(color: misturar(cor, 0.7, 0x000000).opacity(0), location: 1)],
                               center: UnitPoint(x: 0.2, y: 0), startRadiusFraction: 0, endRadiusFraction: 0.78)
        }
    }

    /// color-mix(in srgb, cor p, outra)
    private func misturar(_ c: Color, _ p: Double, _ outra: UInt32) -> Color {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(c).getRed(&r, green: &g, blue: &b, alpha: &a)
        let o = (Double((outra >> 16) & 0xFF) / 255, Double((outra >> 8) & 0xFF) / 255, Double(outra & 0xFF) / 255)
        return Color(red: Double(r) * p + o.0 * (1 - p), green: Double(g) * p + o.1 * (1 - p), blue: Double(b) * p + o.2 * (1 - p))
    }
}

/// .lp-ouvir-progresso: fio de 4pt; tocar ou arrastar leva a voz para aquele ponto.
private struct BarraProgresso: View {
    @EnvironmentObject var player: Player
    @State private var arrasto: Double?

    var body: some View {
        GeometryReader { g in
            TimelineView(.animation(minimumInterval: 1 / 30)) { _ in
                let f = arrasto ?? min(1, max(0, player.tempo / player.duracao))
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.18))
                    Capsule().fill(.white.opacity(0.85)).frame(width: g.size.width * f)
                }
                .frame(height: arrasto == nil ? 4 : 7)
                .frame(maxHeight: .infinity)
                .animation(.easeOut(duration: 0.15), value: arrasto == nil)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { v in arrasto = min(1, max(0, v.location.x / g.size.width)) }
                .onEnded { v in
                    player.ir(para: min(1, max(0, v.location.x / g.size.width)) * player.duracao)
                    arrasto = nil
                })
        }
        .frame(height: 24)
        .padding(.vertical, -10)   // a área de toque é maior que o fio
        .accessibilityElement()
        .accessibilityLabel("Progresso")
        .accessibilityValue("\(Int(player.tempo)) de \(Int(player.duracao)) segundos")
        .accessibilityAdjustableAction { d in player.pular(d == .increment ? 15 : -15) }
    }
}

/// .lp-ouvir-esperando: enquanto a voz carrega, um anel gira em volta do botão de tocar.
private struct AnelEsperando: View {
    @State private var gira = false
    var body: some View {
        Circle().trim(from: 0, to: 0.5)
            .stroke(.white.opacity(0.85), style: StrokeStyle(lineWidth: 2, lineCap: .butt))
            .frame(width: 80, height: 80)
            .rotationEffect(.degrees(gira ? 360 : 0) - .degrees(135))
            .onAppear { withAnimation(.linear(duration: 0.8).repeatForever(autoreverses: false)) { gira = true } }
    }
}

/// .lp-ouvir-aviso: vidro escuro com o texto em itálico e os botões em pílula.
private struct AvisoFimView: View {
    let aviso: AvisoFim
    let escolher: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text(aviso.texto).font(Estilo.leituraItalico(17.6)).foregroundStyle(.white)
                .multilineTextAlignment(.center).padding(.bottom, 13.6)
                .contentTransition(.numericText(countsDown: true))
                .animation(.default, value: aviso.texto)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { ForEach(Array(aviso.botoes.enumerated()), id: \.offset) { i, b in pilula(b, i == 0) } }
                VStack(spacing: 8) {
                    HStack(spacing: 8) { ForEach(Array(aviso.botoes.prefix(2).enumerated()), id: \.offset) { i, b in pilula(b, i == 0) } }
                    HStack(spacing: 8) { ForEach(Array(aviso.botoes.dropFirst(2)), id: \.acao) { b in pilula(b, false) } }
                }
            }
        }
        .padding(.horizontal, 17.6).padding(.top, 17.6).padding(.bottom, 16)
        .frame(width: min(UIScreen.main.bounds.width * 0.92, 416))
        .background(
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                Color(red: 20 / 255, green: 16 / 255, blue: 12 / 255).opacity(0.72)
            }
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.12), .clear], startPoint: .top, endPoint: .center), lineWidth: 1))
        )
        .shadow(color: .black.opacity(0.4), radius: 18, y: 12)
    }

    private func pilula(_ b: (acao: String, rotulo: String), _ principal: Bool) -> some View {
        Button { escolher(b.acao) } label: {
            Text(b.rotulo).font(.system(size: 13.1, weight: .semibold))
                .foregroundStyle(principal ? Color(hex: 0x0d0a07) : .white)
                .padding(.vertical, 10.4).padding(.horizontal, 17.6)
                .background(Capsule().fill(principal ? Color.white : .clear))
                .overlay(Capsule().strokeBorder(principal ? Color.white : .white.opacity(0.28), lineWidth: 1))
                .fixedSize()
        }
        .buttonStyle(Afunda())
    }
}

/// lp-ouvir-sobe: cada parte chega de 18pt abaixo, logo depois de a folha subir.
private struct Sobe: ViewModifier {
    let entrou: Bool
    let atraso: Double
    let reduzido: Bool
    func body(content: Content) -> some View {
        content
            .opacity(entrou || reduzido ? 1 : 0)
            .offset(y: entrou || reduzido ? 0 : 18)
            .animation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.5).delay(atraso), value: entrou)
    }
}

/// Rolar com a mão: a tela deixa de acompanhar a voz por uns segundos.
private struct MaoNaRolagem: ViewModifier {
    let mao: () -> Void
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollPhaseChange { _, fase in if fase == .interacting || fase == .decelerating { mao() } }
        } else {
            content.simultaneousGesture(DragGesture(minimumDistance: 10).onChanged { _ in mao() })
        }
    }
}

private struct RolagemOuvir: PreferenceKey {
    struct Valor: Equatable { var topo: CGFloat = 0; var altura: CGFloat = 0 }
    static let defaultValue = Valor()
    static func reduce(value: inout Valor, nextValue: () -> Valor) { value = nextValue() }
}
