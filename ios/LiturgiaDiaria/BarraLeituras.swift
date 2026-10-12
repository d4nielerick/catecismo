import SwiftUI

/// A barra de baixo do site no celular (.lp-tabs, liturgiadiaria.js → construirNav): três peças de
/// vidro — ( ‹ )  ( leituras do dia )  ( › ) — e, à direita, o botão do menu (MenuVidro). As abas
/// são só ícones; a "luz" (.lp-tabs-luz) desliza com mola até a aba ativa.
enum Barra {
    static let margem: CGFloat = 18     // dos lados da tela (a barra pode passar sobre as faixas floridas)
    static let vao: CGFloat = 10        // entre a cápsula das leituras e o botão do menu
    static let abaivo: CGFloat = 4      // acima da safe area
    static let alturaMax: CGFloat = 64  // como a tab bar do iOS 26

    /// Folga interna da cápsula das abas (a "luz" fica a essa distância da borda).
    static func folga(_ lado: CGFloat) -> CGFloat { (lado * 0.09).rounded() }

    /// Largura de cada aba na altura `lado`.
    static func larguraAba(largura: CGFloat, abas n: Int, lado: CGFloat) -> CGFloat {
        guard n > 0 else { return 0 }
        let livre = largura - 2 * margem - vao - lado - 2 * folga(lado)
        return min((lado * 1.2).rounded(), (livre / CGFloat(n)).rounded(.down))
    }

    /// --lp-barra: a altura das peças (e o diâmetro do botão do menu). 64pt; só encolhe quando
    /// há tantas abas (Vigília Pascal) que cada uma ficaria estreita demais para o dedo.
    static func lado(largura: CGFloat, abas n: Int) -> CGFloat {
        var l = alturaMax
        while l > 48 && n > 0 && larguraAba(largura: largura, abas: n, lado: l) < 46 { l -= 2 }
        return l
    }

    /// Altura total ocupada acima da safe area (para o respiro no fim do texto).
    static func altura(_ lado: CGFloat) -> CGFloat { lado + abaivo }
}

/// As peças da barra que ficam à esquerda do botão do menu.
struct BarraLeituras: View {
    let blocos: [Bloco]               // só os que têm aba
    let ativa: Int
    let lado: CGFloat
    let larguraAba: CGFloat
    let ns: Namespace.ID
    let anterior: Bool                // existe dia anterior com leituras?
    let proximo: Bool
    var tocarAba: (Int) -> Void
    var mudarDia: (Int) -> Void
    @Namespace private var luzNS

    var body: some View {
        Group {
            // as setas de dia ficam só no menu (pedido do dono)
            if !blocos.isEmpty { abas }
        }
    }

    private var abas: some View {
        let icone = min(28, (lado * 0.43).rounded(), larguraAba * 0.62)
        let f = Barra.folga(lado)
        return HStack(spacing: 0) {
            ForEach(Array(blocos.enumerated()), id: \.element.id) { i, b in
                Button { tocarAba(i) } label: {
                    IconeLeitura(leitura: b.leitura)
                        .frame(width: icone, height: icone)
                        .foregroundStyle(i == ativa ? Estilo.vermelho : Color(hex: 0x7d776f))
                        .frame(width: larguraAba, height: lado - 2 * f)
                        .background {
                            if i == ativa {   // .lp-tabs-luz
                                Capsule().fill(Color(hex: 0x281e0f, alpha: 0.07))
                                    .overlay(Capsule().stroke(Color(hex: 0x281e0f, alpha: 0.04), lineWidth: 0.5))
                                    .matchedGeometryEffect(id: "luz", in: luzNS)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(b.leitura.rotulo)
                .accessibilityAddTraits(i == ativa ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, f)
        .frame(height: lado)
        .modifier(Vidro(forma: Capsule(), ns: ns, painel: false, id: "abas"))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Leituras do dia")
    }
}

/// .lp-tabs-dia: bolinha de vidro com a seta; afunda com mola e a seta dá um passo ao toque.
struct BotaoDia: View {
    let sentido: Int
    let lado: CGFloat
    let ns: Namespace.ID
    let ativo: Bool
    var acao: () -> Void
    @State private var passo = false

    var body: some View {
        Button {
            acao()
            withAnimation(.spring(response: 0.18, dampingFraction: 0.5)) { passo = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { passo = false }
            }
        } label: {
            IconeSeta(sentido: sentido)
                .stroke(style: StrokeStyle(lineWidth: 2.4 * lado * 0.41 / 24, lineCap: .round, lineJoin: .round))
                .foregroundStyle(!ativo ? Color(hex: 0xcfc9c0) : passo ? Estilo.vermelho : Estilo.tinta)
                .frame(width: lado * 0.41, height: lado * 0.41)
                .offset(x: passo ? CGFloat(sentido) * 4 : 0)
                .frame(width: lado, height: lado)
                .contentShape(Circle())
        }
        .buttonStyle(Afunda())
        .disabled(!ativo)
        .modifier(Vidro(forma: Circle(), ns: ns, painel: false, id: sentido < 0 ? "ant" : "prox"))
    }
}

/// O "afundar" das peças da barra ao toque (scale 0.92 do CSS).
struct Afunda: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.55), value: configuration.isPressed)
    }
}

// MARK: Ícones (icones-leituras.mjs, viewBox 24×24, traço 2.1)

/// SETA_ANT / SETA_PROX: "M14.5 5.5 8 12l6.5 6.5" (e o espelho).
struct IconeSeta: Shape {
    let sentido: Int
    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: (sentido < 0 ? x : 24 - x) * s, y: y * s) }
        var c = Path()
        c.move(to: p(14.5, 5.5)); c.addLine(to: p(8, 12)); c.addLine(to: p(14.5, 18.5))
        return c
    }
}

/// iconeDaLeitura: pergaminho com o número romano (leituras), nota musical (salmo), livro com a cruz (evangelho).
struct IconeLeitura: View {
    let leitura: Leitura

    var body: some View {
        GeometryReader { g in
            let s = g.size.width / 24
            let traco = StrokeStyle(lineWidth: 2.1 * s, lineCap: .round, lineJoin: .round)
            switch leitura.tipo {
            case "salmo": DesenhoSalmo().stroke(style: traco)
            case "evangelho": DesenhoEvangelho().stroke(style: traco)
            default:
                let rom = Self.romano(numero)
                let corpo: CGFloat = rom.count == 1 ? 8.6 : rom.count == 2 ? 7.4 : 5.8
                ZStack {
                    DesenhoPergaminho().stroke(style: traco)
                    Text(rom).font(.custom("TimesNewRomanPS-BoldMT", fixedSize: corpo * s * 0.92))
                        .kerning(0.02 * corpo * s)
                        .position(x: 12 * s, y: 12.2 * s)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }

    /// "1ª Leitura" → 1, "2ª Leitura" → 2, vigília "3ª Leitura"…; "Epístola" → 2.
    private var numero: Int {
        if leitura.rotulo.contains("Epístola") { return 2 }
        return Int(leitura.rotulo.prefix(while: \.isNumber)) ?? 1
    }

    static func romano(_ n: Int) -> String {
        let r = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]
        return (1...r.count).contains(n) ? r[n - 1] : String(n)
    }
}

private extension Path {
    /// O arco "a" do SVG em quartos/semicírculos: centro, ângulo inicial e quanto andar (positivo = sentido horário na tela).
    mutating func arco(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, de a: Double, anda d: Double, _ s: CGFloat) {
        addRelativeArc(center: CGPoint(x: cx * s, y: cy * s), radius: r * s, startAngle: .degrees(a), delta: .degrees(d))
    }
}

/// PERGAMINHO: "M6 4.5h11.5a2.5 2.5 0 0 1 0 5H17v8a2 2 0 0 1-2 2H6.5a2.5 2.5 0 0 1 0-5H7v-7.5a2.5 2.5 0 0 0-1-2.5Z"
struct DesenhoPergaminho: Shape {
    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
        var c = Path()
        c.move(to: p(6, 4.5)); c.addLine(to: p(17.5, 4.5))
        c.arco(17.5, 7, 2.5, de: -90, anda: 180, s)
        c.addLine(to: p(17, 9.5)); c.addLine(to: p(17, 17.5))
        c.arco(15, 17.5, 2, de: 0, anda: 90, s)
        c.addLine(to: p(6.5, 19.5))
        c.arco(6.5, 17, 2.5, de: 90, anda: 180, s)
        c.addLine(to: p(7, 14.5)); c.addLine(to: p(7, 7))
        c.addQuadCurve(to: p(6, 4.5), control: p(7, 5.2))
        c.closeSubpath()
        return c
    }
}

/// salmo: "M9 18V6.5l10-2V16" e as duas cabeças de nota.
struct DesenhoSalmo: Shape {
    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
        var c = Path()
        c.move(to: p(9, 18)); c.addLine(to: p(9, 6.5)); c.addLine(to: p(19, 4.5)); c.addLine(to: p(19, 16))
        c.addEllipse(in: CGRect(x: 4 * s, y: 15.5 * s, width: 5 * s, height: 5 * s))
        c.addEllipse(in: CGRect(x: 14 * s, y: 13.5 * s, width: 5 * s, height: 5 * s))
        return c
    }
}

/// evangelho: livro ("M5 19V5.5A2.5 2.5 0 0 1 7.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2Zm0 0a2 2 0 0 1 2-2h12")
/// com a cruz ("M12 6.5v7M9.5 9h5").
struct DesenhoEvangelho: Shape {
    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
        var c = Path()
        c.move(to: p(5, 19)); c.addLine(to: p(5, 5.5))
        c.arco(7.5, 5.5, 2.5, de: 180, anda: 90, s)
        c.addLine(to: p(18, 3))
        c.arco(18, 4, 1, de: -90, anda: 90, s)
        c.addLine(to: p(19, 20))
        c.arco(18, 20, 1, de: 0, anda: 90, s)
        c.addLine(to: p(7, 21))
        c.arco(7, 19, 2, de: 90, anda: 90, s)
        c.closeSubpath()
        c.move(to: p(5, 19))
        c.arco(7, 19, 2, de: 180, anda: 90, s)
        c.addLine(to: p(19, 17))
        c.move(to: p(12, 6.5)); c.addLine(to: p(12, 13.5))
        c.move(to: p(9.5, 9)); c.addLine(to: p(14.5, 9))
        return c
    }
}
