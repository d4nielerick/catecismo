import SwiftUI
import UIKit

/// Tamanho do texto das leituras (.lp-menu-fonte do site): cinco passos sobre os 16pt do corpo.
enum TamanhoTexto {
    static let chave = "escalaTexto"
    static let escalas: [CGFloat] = [0.875, 1, 1.125, 1.25, 1.375]
    static let padrao = 1
    static func escala(_ i: Int) -> CGFloat { escalas[min(max(i, 0), escalas.count - 1)] }
}

/// O menu do app (o menu do site, liturgiadiaria/menu.mjs), em vidro da Apple: um botão redondo
/// no canto de baixo que, ao toque, se desfaz e vira o painel (morph com glassEffectID no iOS 26;
/// no iOS 17–25, material translúcido com matchedGeometryEffect).
struct MenuVidro: View {
    @Binding var data: Date
    @Binding var avisos: Bool
    @Binding var aberto: Bool
    @AppStorage(TamanhoTexto.chave) private var escala = TamanhoTexto.padrao
    @State private var avisoNegado = false
    @Namespace private var ns
    @Environment(\.openURL) private var abrirURL

    private let raio: CGFloat = 34
    private let mola = Animation.spring(response: 0.46, dampingFraction: 0.84)

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if aberto {
                Color(hex: 0x281e0f).opacity(0.22)   // .lp-menu::backdrop
                    .ignoresSafeArea()
                    .onTapGesture { alternar() }
                    .transition(.opacity)
                    .accessibilityHidden(true)
            }
            container {
                if aberto {
                    painel
                        .modifier(Vidro(forma: RoundedRectangle(cornerRadius: raio, style: .continuous),
                                        ns: ns, painel: true))
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                } else {
                    botao
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
    }

    @ViewBuilder private func container<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        if #available(iOS 26, *) { GlassEffectContainer(spacing: 20) { c() } } else { c() }
    }

    private func alternar() {
        withAnimation(mola) { aberto.toggle() }
    }

    // MARK: Botão (.lp-menu-fab)

    private var botao: some View {
        Button(action: alternar) {
            IconeMenu()
                .stroke(Estilo.tinta, style: StrokeStyle(lineWidth: 2.1, lineCap: .round))
                .frame(width: 22, height: 22)
                .frame(width: 54, height: 54)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(Vidro(forma: Circle(), ns: ns, painel: false))
        .padding(.trailing, 40)
        .padding(.bottom, 10)
        .accessibilityLabel("Abrir o menu")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: Painel (.lp-menu)

    private var painel: some View {
        VStack(alignment: .leading, spacing: 0) {
            secaoApoio
            separador
            secaoDia
            separador
            secaoFonte
            separador
            secaoAvisos
            separador
            compartilhar
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .topTrailing) { fechar.padding(12) }
        .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .bottomTrailing)))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Menu")
        .accessibilityAddTraits(.isModal)
    }

    private var separador: some View {
        Rectangle().fill(Color(hex: 0x281e0f, alpha: 0.1)).frame(height: 1).padding(.vertical, 14)
    }

    /// .lp-menu-sec h3: versalete pequeno, espaçado, cinza.
    private func titulo(_ t: String) -> some View {
        Text(t.uppercased()).font(Estilo.sans(11, .semibold)).kerning(1.3)
            .foregroundStyle(Estilo.suave).padding(.bottom, 10)
            .accessibilityAddTraits(.isHeader)
            .accessibilityLabel(t)
    }

    private var fechar: some View {
        Button(action: alternar) {
            Image(systemName: "xmark").font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Estilo.tinta).frame(width: 36, height: 36)
                .background(Circle().fill(Color(hex: 0x281e0f, alpha: 0.07)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .accessibilityLabel("Fechar o menu")
    }

    // 1. Apoio: só leva ao site, sem pagamento dentro do app (regra da App Store).
    private var secaoApoio: some View {
        VStack(alignment: .leading, spacing: 0) {
            titulo("Ajude a manter o site").padding(.trailing, 44)
            Text("Para manter o site no ar temos algumas despesas. Contribua.")
                .font(Estilo.leitura(15.5)).foregroundStyle(Estilo.texto).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 14)
            Button {
                if let u = URL(string: "https://santadoutrina.com/liturgiadiaria/") { abrirURL(u) }
            } label: {
                Text("Apoiar o site").font(Estilo.sans(15, .semibold)).kerning(0.3)
                    .frame(maxWidth: .infinity).frame(minHeight: 24)
            }
            .modifier(BotaoVidro(destaque: true))
            .accessibilityHint("Abre o site no Safari")
        }
    }

    // 2. Dia: anterior, a data e o próximo; "Hoje" quando estiver em outro dia.
    private var secaoDia: some View {
        let cal = Calendar.current
        let ant = cal.date(byAdding: .day, value: -1, to: data)!
        let prox = cal.date(byAdding: .day, value: 1, to: data)!
        let ehHoje = cal.isDateInToday(data)
        return VStack(spacing: 10) {
            HStack(spacing: 8) {
                Button { mover(ant) } label: {
                    Text("← " + Cabecalho.dataCurta(ant)).font(Estilo.titulo(19)).lineLimit(1).fixedSize()
                }
                .modifier(BotaoVidro(compacto: true))
                .accessibilityLabel("Dia anterior, \(Datas.longa(ant))")
                Spacer(minLength: 0)
                VStack(spacing: 2) {
                    Text(Cabecalho.dataCurta(data)).font(Estilo.titulo(26)).tracking(-0.5)
                        .foregroundStyle(Estilo.tinta)
                    Text(Cabecalho.semanaF.string(from: data).replacingOccurrences(of: "-feira", with: "").uppercased())
                        .font(Estilo.sans(10, .semibold)).kerning(1.2).foregroundStyle(Estilo.suave)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Dia mostrado: \(Datas.longa(data))")
                Spacer(minLength: 0)
                Button { mover(prox) } label: {
                    Text(Cabecalho.dataCurta(prox) + " →").font(Estilo.titulo(19)).lineLimit(1).fixedSize()
                }
                .modifier(BotaoVidro(compacto: true))
                .accessibilityLabel("Próximo dia, \(Datas.longa(prox))")
            }
            .foregroundStyle(Estilo.tinta)
            Button { mover(Date()) } label: {
                Text(ehHoje ? "Você está no dia de hoje" : "Voltar para hoje")
                    .font(Estilo.sans(13.5, ehHoje ? .regular : .semibold))
                    .foregroundStyle(ehHoje ? Estilo.suave : Estilo.vermelho)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(ehHoje)
            .accessibilityLabel(ehHoje ? "Já está no dia de hoje" : "Hoje")
        }
    }

    private func mover(_ d: Date) {
        withAnimation(.easeInOut(duration: 0.2)) { data = d }
    }

    // 3. Tamanho do texto: A menor, pontinhos de escala, A maior.
    private var secaoFonte: some View {
        let n = TamanhoTexto.escalas.count
        let i = min(max(escala, 0), n - 1)
        return VStack(alignment: .leading, spacing: 0) {
            titulo("Tamanho do texto")
            HStack(spacing: 14) {
                Button { mudarFonte(-1) } label: {
                    Text("A").font(Estilo.titulo(16)).frame(width: 30, height: 30)
                }
                .modifier(BotaoVidro(circulo: true))
                .disabled(i == 0)
                .accessibilityLabel("Diminuir o texto")
                Pontos(n: n, i: i) { k in
                    guard k != escala else { return }
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { escala = k }
                }
                    .frame(height: 44)
                    .accessibilityElement()
                    .accessibilityLabel("Tamanho do texto")
                    .accessibilityValue("\(i + 1) de \(n)")
                    .accessibilityAdjustableAction { d in
                        switch d {
                        case .increment: mudarFonte(1)
                        case .decrement: mudarFonte(-1)
                        @unknown default: break
                        }
                    }
                Button { mudarFonte(1) } label: {
                    Text("A").font(Estilo.titulo(27)).frame(width: 30, height: 30)
                }
                .modifier(BotaoVidro(circulo: true))
                .disabled(i == n - 1)
                .accessibilityLabel("Aumentar o texto")
            }
            .foregroundStyle(Estilo.tinta)
        }
    }

    private func mudarFonte(_ d: Int) {
        let n = TamanhoTexto.escalas.count
        withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
            escala = min(max(escala + d, 0), n - 1)
        }
    }

    // 4. Evangelho de hoje: o aviso local das 6h (Avisos).
    private var secaoAvisos: some View {
        VStack(alignment: .leading, spacing: 0) {
            titulo("Evangelho de hoje")
            Text("Receba o Evangelho todo dia às 6h, direto no aparelho.")
                .font(Estilo.leitura(15.5)).foregroundStyle(Estilo.texto).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 14)
            if avisos {
                HStack(spacing: 10) {
                    Circle().fill(Estilo.vermelho).frame(width: 8, height: 8)
                    Text("Aviso das 6h ligado").font(Estilo.sans(14.5, .medium)).foregroundStyle(Estilo.tinta)
                    Spacer(minLength: 8)
                    Button {
                        Avisos.desligar(); withAnimation { avisos = false }
                    } label: {
                        Text("Desligar").font(Estilo.sans(14, .semibold)).foregroundStyle(Estilo.tinta)
                    }
                    .modifier(BotaoVidro())
                    .accessibilityLabel("Desligar o aviso das 6h")
                }
                .accessibilityElement(children: .contain)
            } else {
                Button {
                    Task {
                        let ok = await Avisos.ligar()
                        withAnimation { avisos = ok; avisoNegado = !ok }
                    }
                } label: {
                    Label("Ativar avisos", systemImage: "bell")
                        .font(Estilo.sans(15, .semibold)).foregroundStyle(Estilo.tinta)
                        .frame(maxWidth: .infinity).frame(minHeight: 24)
                }
                .modifier(BotaoVidro())
                .accessibilityLabel("Ativar o aviso das 6h")
                if avisoNegado {
                    Button {
                        if let u = URL(string: UIApplication.openSettingsURLString) { abrirURL(u) }
                    } label: {
                        Text("As notificações estão desligadas para o app. Toque para abrir os Ajustes.")
                            .font(Estilo.sans(12.5)).foregroundStyle(Estilo.suave)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 10)
                }
            }
        }
    }

    // 5. Compartilhar o dia.
    private var compartilhar: some View {
        let url = URL(string: "https://liturgia.santadoutrina.com/\(Datas.chave(data))/")!
        return ShareLink(item: url, subject: Text("Liturgia Diária"),
                         message: Text("Liturgia Diária de \(Datas.longa(data))")) {
            Label("Compartilhar o dia", systemImage: "square.and.arrow.up")
                .font(Estilo.sans(15, .semibold)).foregroundStyle(Estilo.tinta)
                .frame(maxWidth: .infinity).frame(minHeight: 24)
        }
        .modifier(BotaoVidro())
        .accessibilityLabel("Compartilhar a liturgia de \(Datas.longa(data))")
    }
}

/// As três linhas do ICONE_MENU do site (a de baixo mais curta).
struct IconeMenu: Shape {
    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        var p = Path()
        p.move(to: CGPoint(x: 5 * s, y: 8 * s)); p.addLine(to: CGPoint(x: 19 * s, y: 8 * s))
        p.move(to: CGPoint(x: 5 * s, y: 12 * s)); p.addLine(to: CGPoint(x: 19 * s, y: 12 * s))
        p.move(to: CGPoint(x: 5 * s, y: 16 * s)); p.addLine(to: CGPoint(x: 14 * s, y: 16 * s))
        return p
    }
}

/// .lp-menu-pontos: trilho, linha vermelha que enche até o nível, pontinhos e o polegar.
struct Pontos: View {
    let n: Int
    let i: Int
    var mudar: (Int) -> Void = { _ in }
    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            let p = CGFloat(i) / CGFloat(n - 1)
            let y = g.size.height / 2
            ZStack(alignment: .leading) {
                Capsule().fill(Color(hex: 0x281e0f, alpha: 0.12)).frame(height: 2)
                Capsule().fill(Estilo.vermelho).frame(width: w * p, height: 2)
                ForEach(0..<n, id: \.self) { k in
                    Circle().fill(k <= i ? Estilo.vermelho : Color(hex: 0xd3cdc3))
                        .frame(width: 8, height: 8)
                        .position(x: 4 + (w - 8) * CGFloat(k) / CGFloat(n - 1), y: y)
                }
                Circle().fill(.white)
                    .overlay(Circle().stroke(Estilo.vermelho, lineWidth: 2))
                    .shadow(color: Estilo.vermelho.opacity(0.3), radius: 4, y: 2)
                    .frame(width: 24, height: 24)
                    .position(x: 4 + (w - 8) * p, y: y)
            }
            .frame(height: g.size.height)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { v in   // tocar ou arrastar no trilho
                let k = Int(((v.location.x - 4) / max(w - 8, 1) * CGFloat(n - 1)).rounded())
                mudar(min(max(k, 0), n - 1))
            })
        }
    }
}

/// O vidro do botão e do painel. iOS 26+: Liquid Glass com o mesmo glassEffectID, que faz o
/// botão se transformar no painel. Antes: material translúcido com matchedGeometryEffect.
struct Vidro<S: Shape>: ViewModifier {
    let forma: S
    let ns: Namespace.ID
    let painel: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content
                .glassEffect(painel ? .regular.tint(Color(hex: 0xfdfcfa, alpha: 0.55))
                                    : .regular.tint(Color(hex: 0xfdfcfa, alpha: 0.35)).interactive(),
                             in: forma)
                .glassEffectID("menu", in: ns)
        } else {
            content
                .background(forma.fill(.ultraThinMaterial))
                .background(forma.fill(Color(hex: 0xfdfcfa, alpha: painel ? 0.7 : 0.5)))
                .overlay(forma.stroke(Color(hex: 0x281e0f, alpha: 0.1), lineWidth: 0.5))
                .clipShape(forma)
                .shadow(color: Color(hex: 0x281e0f, alpha: 0.22), radius: painel ? 24 : 12, y: painel ? 12 : 5)
                .matchedGeometryEffect(id: "menu", in: ns)
        }
    }
}

/// Botões do menu: .glass / .glassProminent no iOS 26; cápsula translúcida antes.
struct BotaoVidro: ViewModifier {
    var destaque = false
    var circulo = false
    var compacto = false

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            if destaque {
                content.buttonStyle(.glassProminent).tint(Estilo.vermelho).foregroundStyle(.white)
                    .controlSize(.large)
            } else {
                content.buttonStyle(.glass).controlSize(compacto ? .regular : .large)
                    .buttonBorderShape(circulo ? .circle : .capsule)
            }
        } else {
            content.buttonStyle(CapsulaAntiga(destaque: destaque, circulo: circulo))
        }
    }
}

struct CapsulaAntiga: ButtonStyle {
    let destaque: Bool
    var circulo = false
    @Environment(\.isEnabled) private var ativo

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, circulo ? 9 : 16).padding(.vertical, 9)
            .foregroundStyle(destaque ? Color.white : Estilo.tinta)
            .background(Capsule().fill(destaque ? AnyShapeStyle(Estilo.vermelho) : AnyShapeStyle(.thinMaterial)))
            .overlay(Capsule().stroke(Color(hex: 0x281e0f, alpha: destaque ? 0 : 0.1), lineWidth: 0.5))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(ativo ? 1 : 0.35)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
