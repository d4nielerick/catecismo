import UIKit

/// Os cards de compartilhar do site (liturgiadiaria/compartilhar.mjs e imagem-do-dia.mjs),
/// desenhados no tamanho real (1080 de largura) com Core Graphics: as mesmas medidas do <canvas>.
struct ConteudoCard: Equatable {
    var dt: String
    var trecho: String
    var referencia: String
    var rotulo: String
    var dataCurta: String
    var cor: String
    var aspas = false
}

enum LayoutCard: Int, CaseIterable, Identifiable {
    case feed, stories, texto
    var id: Int { rawValue }
    var nome: String { ["Feed", "Stories", "Só texto"][rawValue] }
    var arquivo: String { ["editorial-feed", "editorial-stories", "texto"][rawValue] }
    var tamanho: CGSize { CGSize(width: 1080, height: self == .stories ? 1920 : 1350) }
}

enum Cards {
    static let site = "liturgia.santadoutrina.com"
    static let vermelho = UIColor(red: 0xcb / 255.0, green: 0x2e / 255.0, blue: 0x2e / 255.0, alpha: 1)

    // MARK: Fontes (TITULO = Times, LEITURA = Inria Serif)

    static func times(_ t: CGFloat, italico: Bool = false) -> UIFont {
        UIFont(name: italico ? "TimesNewRomanPS-ItalicMT" : "TimesNewRomanPSMT", size: t) ?? .systemFont(ofSize: t)
    }
    static func inria(_ t: CGFloat, italico: Bool = false, negrito: Bool = false) -> UIFont {
        UIFont(name: negrito ? "InriaSerif-Bold" : italico ? "InriaSerif-Italic" : "InriaSerif-Regular", size: t) ?? .systemFont(ofSize: t)
    }

    static func cor(_ hex: UInt32, _ a: CGFloat = 1) -> UIColor {
        UIColor(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: a)
    }

    // MARK: Texto no estilo do canvas (y = linha de base)

    static func largura(_ s: String, _ f: UIFont) -> CGFloat { (s as NSString).size(withAttributes: [.font: f]).width }

    static func escrever(_ s: String, _ x: CGFloat, _ y: CGFloat, _ f: UIFont, _ c: UIColor, direita: Bool = false) {
        let x0 = direita ? x - largura(s, f) : x
        (s as NSString).draw(at: CGPoint(x: x0, y: y - f.ascender), withAttributes: [.font: f, .foregroundColor: c])
    }

    static func quebrar(_ texto: String, _ f: UIFont, _ larg: CGFloat, recuo: CGFloat = 0, comRecuo: Int = 0) -> [String] {
        var linhas: [String] = []
        var linha = ""
        for p in texto.split(whereSeparator: \.isWhitespace).map(String.init) {
            let lim = linhas.count < comRecuo ? larg - recuo : larg
            let teste = linha.isEmpty ? p : "\(linha) \(p)"
            if !linha.isEmpty && largura(teste, f) > lim { linhas.append(linha); linha = p } else { linha = teste }
        }
        if !linha.isEmpty { linhas.append(linha) }
        return linhas
    }

    /// Linha justificada; a última fica à esquerda. `maxEspaco`: linha curta demais não estica.
    static func justificar(_ linha: String, _ x: CGFloat, _ y: CGFloat, _ larg: CGFloat, ultima: Bool, _ f: UIFont, _ c: UIColor, maxEspaco: CGFloat = .infinity) {
        let ps = linha.split(separator: " ").map(String.init)
        if ultima || ps.count < 2 { escrever(linha, x, y, f, c); return }
        let soma = ps.reduce(0) { $0 + largura($1, f) }
        let esp = (larg - soma) / CGFloat(ps.count - 1)
        if esp > maxEspaco { escrever(linha, x, y, f, c); return }
        var cx = x
        for p in ps { escrever(p, cx, y, f, c); cx += largura(p, f) + esp }
    }

    static func larguraEspacada(_ s: String, _ f: UIFont, _ e: CGFloat) -> CGFloat {
        s.reduce(-e) { $0 + largura(String($1), f) + e }
    }
    @discardableResult
    static func espacado(_ s: String, _ x: CGFloat, _ y: CGFloat, _ f: UIFont, _ c: UIColor, _ e: CGFloat) -> CGFloat {
        var x = x
        for ch in s { escrever(String(ch), x, y, f, c); x += largura(String(ch), f) + e }
        return x
    }

    /// encaixar: maior corpo (entre max e min) em que o texto cabe na caixa; abaixo do mínimo, corta com "…".
    static func encaixar(_ texto: String, fonte: (CGFloat) -> UIFont, larg: CGFloat, alt: CGFloat, max: CGFloat, min: CGFloat, entrelinha: CGFloat) -> (linhas: [String], t: CGFloat, lh: CGFloat) {
        var t = max
        while t >= min {
            let ls = quebrar(texto, fonte(t), larg)
            if CGFloat(ls.count) * t * entrelinha <= alt { return (ls, t, t * entrelinha) }
            t -= 2
        }
        let cabem = Swift.max(1, Int(alt / (min * entrelinha)))
        var ls = Array(quebrar(texto, fonte(min), larg).prefix(cabem))
        if var u = ls.last {
            if let r = u.range(of: #"[\s,.;:!?]*\S*$"#, options: .regularExpression) { u.replaceSubrange(r, with: "…") }
            ls[ls.count - 1] = u
        }
        return (ls, min, min * entrelinha)
    }

    // MARK: Fundos

    /// Grão de papel (o ruido() do canvas), feito uma vez e repetido.
    static let grao: UIImage = {
        let n = 192
        var px = [UInt8](repeating: 0, count: n * n * 4)
        for i in 0..<(n * n) {
            let v = Int.random(in: -7...7)
            let a = UInt8(abs(v) * 3)
            let c: UInt8 = v > 0 ? 255 : 0
            px[i * 4] = c == 255 ? a : 0; px[i * 4 + 1] = c == 255 ? a : 0; px[i * 4 + 2] = c == 255 ? a : 0; px[i * 4 + 3] = a
        }
        let cs = CGColorSpaceCreateDeviceRGB()
        let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: cs,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        return UIImage(cgImage: ctx.makeImage()!)
    }()

    static func papel(_ ctx: CGContext, _ r: CGRect, _ fundo: UIColor) {
        fundo.setFill(); ctx.fill(r)
        let cs = CGColorSpaceCreateDeviceRGB()
        let g = CGGradient(colorsSpace: cs, colors: [UIColor(white: 1, alpha: 0.18).cgColor, UIColor(red: 90 / 255, green: 60 / 255, blue: 20 / 255, alpha: 0.10).cgColor] as CFArray, locations: [0, 1])!
        ctx.saveGState(); ctx.clip(to: r)
        let c = CGPoint(x: r.midX, y: r.minY + r.height * 0.4)
        ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: max(r.width, r.height) * 0.8, options: [.drawsAfterEndLocation])
        UIColor(patternImage: grao).setFill(); ctx.fill(r)
        ctx.restoreGState()
    }

    static let tons: [String: (UInt32, UInt32, UInt32)] = [
        "branco": (0x3a2a12, 0x8a6424, 0xf3d58c), "verde": (0x12261a, 0x2f5a3a, 0xcfe0b4), "roxo": (0x1d1428, 0x4a3266, 0xd9c6ec),
        "vermelho": (0x2a0e0c, 0x7a2420, 0xf2b9a2), "rosa": (0x2e1520, 0x8a4a62, 0xf3cad6), "preto": (0x141312, 0x3a3632, 0xcfc8bf),
    ]

    /// A pintura recortada para cobrir a área (object-fit: cover, um pouco acima do centro); sem ela, a luz com a cruz.
    static func arte(_ ctx: CGContext, _ r: CGRect, _ img: UIImage?, corDia: String) {
        ctx.saveGState(); ctx.clip(to: r)
        if let img {
            let e = max(r.width / img.size.width, r.height / img.size.height)
            let w = img.size.width * e, h = img.size.height * e
            img.draw(in: CGRect(x: r.minX + (r.width - w) / 2, y: r.minY + (r.height - h) * 0.4, width: w, height: h))
            ctx.restoreGState(); return
        }
        let (escuro, medio, luz) = tons[corDia] ?? tons["branco"]!
        let cs = CGColorSpaceCreateDeviceRGB()
        let fundo = CGGradient(colorsSpace: cs, colors: [cor(escuro).cgColor, cor(medio).cgColor, cor(escuro).cgColor] as CFArray, locations: [0, 0.55, 1])!
        ctx.drawLinearGradient(fundo, start: CGPoint(x: 0, y: r.minY), end: CGPoint(x: 0, y: r.maxY), options: [])
        let c = CGPoint(x: r.midX, y: r.minY + r.height * 0.42)
        let halo = CGGradient(colorsSpace: cs, colors: [cor(luz).cgColor, cor(luz, 0.66).cgColor, UIColor.clear.cgColor] as CFArray, locations: [0, 0.25, 1])!
        ctx.drawRadialGradient(halo, startCenter: c, startRadius: 0, endCenter: c, endRadius: max(r.width, r.height) * 0.6, options: [])
        ctx.setStrokeColor(cor(luz, 0.2).cgColor); ctx.setLineWidth(3)
        for i in 0..<36 {
            let a = CGFloat(i) / 36 * .pi * 2
            ctx.move(to: c); ctx.addLine(to: CGPoint(x: c.x + cos(a) * r.width * 1.2, y: c.y + sin(a) * r.width * 1.2))
        }
        ctx.strokePath()
        let s = min(r.width, r.height) * 0.5
        ctx.setShadow(offset: .zero, blur: 40, color: UIColor(white: 0, alpha: 0.45).cgColor)
        cor(escuro).setFill()
        ctx.fill(CGRect(x: c.x - s * 0.05, y: c.y - s * 0.55, width: s * 0.1, height: s * 1.25))
        ctx.fill(CGRect(x: c.x - s * 0.32, y: c.y - s * 0.3, width: s * 0.64, height: s * 0.1))
        ctx.restoreGState()
    }

    /// A faixa floral vermelha (o asset "Faixa", já tingido), repetida na altura.
    static func faixa(_ ctx: CGContext, x: CGFloat, w: CGFloat, h: CGFloat, alfa: CGFloat = 1) {
        guard let img = UIImage(named: "Faixa") else { return }
        let ih = img.size.height * (w / img.size.width)
        var y: CGFloat = 0
        while y < h { img.draw(in: CGRect(x: x, y: y, width: w, height: ih), blendMode: .normal, alpha: alfa); y += ih }
    }

    // MARK: O L da marca (.lp-preloader-letra, caixa 100×100)

    static let caminhoL: UIBezierPath = {
        let d = "M 66.65 13.89 C 67.17 13.78 68.33 13.89 68.86 13.99 C 72.64 14.66 73.49 18.43 72.88 21.72 C 72.80 22.18 72.66 22.66 72.56 23.12 C 72.36 24.07 71.98 24.99 71.60 25.88 C 69.00 32.07 63.49 37.45 57.89 41.02 C 56.60 41.80 55.29 42.49 53.96 43.20 C 53.73 43.32 52.17 44.01 52.08 44.20 C 51.97 44.42 51.77 45.36 51.69 45.65 L 50.55 49.67 C 48.99 55.23 46.93 60.51 43.69 65.30 C 43.49 65.58 42.38 67.01 42.35 67.22 C 42.49 67.40 43.71 67.91 44.00 68.04 C 48.82 70.11 53.66 72.17 58.55 74.05 C 59.69 74.49 60.99 74.92 62.16 75.27 C 66.85 76.64 72.02 77.81 76.83 76.31 C 77.46 76.03 78.32 75.79 78.90 75.44 C 79.49 75.10 80.16 74.64 80.67 74.21 C 81.91 73.17 82.95 71.95 83.30 70.33 C 83.72 68.35 82.79 65.98 80.70 65.44 C 80.30 65.37 79.83 65.39 79.44 65.29 C 79.07 65.20 78.93 64.53 79.40 64.34 C 80.14 64.05 81.01 64.17 81.76 64.37 C 82.11 64.47 82.53 64.69 82.85 64.87 C 83.62 65.36 84.42 66.25 84.79 67.08 C 87.37 72.85 82.45 79.81 77.29 82.22 C 69.57 85.84 61.24 82.46 54.20 78.96 C 51.64 77.70 49.12 76.36 46.64 74.95 C 44.90 73.94 43.14 72.97 41.37 72.03 C 40.74 71.69 39.98 71.27 39.33 70.99 C 39.14 70.91 38.13 72.00 37.94 72.19 C 35.27 74.85 32.96 76.53 29.61 78.20 C 25.52 80.01 20.41 80.46 16.87 77.23 C 15.65 76.13 14.92 74.59 14.85 72.95 C 14.75 70.83 15.70 68.98 17.11 67.45 C 17.98 66.51 19.09 65.75 20.22 65.17 C 23.57 63.46 27.09 63.27 30.74 63.88 C 31.21 63.96 31.71 63.98 32.17 64.09 C 32.91 64.29 36.99 65.40 37.34 65.38 C 37.47 65.38 37.54 65.33 37.63 65.23 C 37.95 64.84 38.12 64.31 38.35 63.86 C 38.46 63.67 38.61 63.50 38.71 63.30 C 38.98 62.77 39.19 62.16 39.44 61.61 C 41.21 57.61 42.52 53.38 43.77 49.19 C 43.91 48.70 44.54 46.74 44.51 46.34 C 44.24 46.22 42.72 46.64 42.29 46.69 C 40.74 46.87 39.19 46.93 37.63 46.87 C 30.89 46.66 22.90 41.67 23.23 34.17 C 23.23 33.44 23.26 32.64 23.44 31.92 C 25.76 22.59 37.18 19.78 45.24 23.07 C 46.78 23.69 45.91 24.51 45.40 24.42 C 42.61 23.91 40.33 23.53 37.50 24.11 C 32.13 25.22 28.18 29.83 29.59 35.46 C 31.35 42.27 38.61 44.83 44.97 43.66 C 45.43 43.58 45.92 41.54 46.06 41.07 C 48.25 33.71 50.78 26.39 55.88 20.46 C 58.41 17.52 62.52 14.18 66.65 13.89 z M 66.92 16.27 C 67.96 16.08 69.15 16.89 69.47 17.85 C 70.28 20.21 69.42 23.57 68.42 25.79 C 66.13 30.90 62.21 35.38 57.74 38.70 C 57.06 39.20 55.44 40.31 54.70 40.60 C 54.25 40.81 53.23 41.48 52.75 41.48 L 52.70 41.43 C 52.72 40.80 53.37 38.87 53.58 38.17 C 55.34 32.37 57.28 26.41 60.62 21.31 C 62.16 18.94 64.04 16.80 66.92 16.27 z M 24.76 66.82 C 25.07 66.76 27.06 66.80 27.44 66.82 C 29.79 66.97 32.16 67.72 34.34 68.57 C 34.61 68.68 35.32 68.94 35.50 69.14 C 35.50 69.17 35.51 69.22 35.49 69.25 C 33.73 72.09 30.80 74.72 27.80 76.00 C 26.82 76.37 25.78 76.71 24.74 76.79 C 22.77 76.92 20.81 76.74 19.25 75.39 C 18.46 74.69 17.98 73.71 17.91 72.66 C 17.69 69.11 21.68 67.00 24.76 66.82 z"
        let p = UIBezierPath()
        var tokens = d.split(separator: " ").map(String.init)[...]
        func num() -> CGFloat { CGFloat(Double(tokens.popFirst() ?? "0") ?? 0) }
        func pt() -> CGPoint { let x = num(); return CGPoint(x: x, y: num()) }
        while let t = tokens.popFirst() {
            switch t {
            case "M": p.move(to: pt())
            case "L": p.addLine(to: pt())
            case "C": let a = pt(), b = pt(); p.addCurve(to: pt(), controlPoint1: a, controlPoint2: b)
            case "z", "Z": p.close()
            default: break
            }
        }
        p.usesEvenOddFillRule = true
        return p
    }()

    static func logo(_ ctx: CGContext, x: CGFloat, y: CGFloat, tamanho: CGFloat, cor: UIColor) {
        ctx.saveGState()
        ctx.translateBy(x: x, y: y); ctx.scaleBy(x: tamanho / 100, y: tamanho / 100)
        cor.setFill(); caminhoL.fill()
        ctx.restoreGState()
    }
    /// O L com a ponta direita do traço em xDireita.
    static func logoPelaDireita(_ ctx: CGContext, _ xDir: CGFloat, _ y: CGFloat, _ t: CGFloat, _ c: UIColor) {
        logo(ctx, x: xDir - t * 0.865, y: y, tamanho: t, cor: c)
    }

    // MARK: Cards do trecho

    static func render(_ tamanho: CGSize, _ desenho: (CGContext) -> Void) -> UIImage {
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1; f.opaque = true
        return UIGraphicsImageRenderer(size: tamanho, format: f).image { desenho($0.cgContext) }
    }

    static func card(_ layout: LayoutCard, _ c: ConteudoCard, arte img: UIImage?) -> UIImage {
        render(layout.tamanho) { ctx in
            let W = layout.tamanho.width, H = layout.tamanho.height
            if layout == .texto { soTexto(ctx, W, H, c) } else { editorial(ctx, W, H, c, img) }
        }
    }

    static let corFundo: [String: UInt32] = ["roxo": 0xf0ecf8, "branco": 0xfaf7ee, "verde": 0xedf5ef, "vermelho": 0xf8edeb, "rosa": 0xf8edf2, "preto": 0xeeeceb]

    /// Rodapé: a data curta em vermelho à esquerda e o endereço à direita, na mesma linha de base.
    static func rodape(_ W: CGFloat, _ y: CGFloat, _ m: CGFloat, _ c: ConteudoCard, _ tinta: UIColor, mDir: CGFloat? = nil) {
        escrever(c.dataCurta, m, y, times(50, italico: true), vermelho)
        let f = inria(27)
        espacado(site, W - (mDir ?? m) - larguraEspacada(site, f, 1.5), y, f, tinta.withAlphaComponent(0.72), 1.5)
    }

    /// Metade de cima a pintura, embaixo papel claro: rótulo espaçado, texto justificado, rodapé e o L.
    static func editorial(_ ctx: CGContext, _ W: CGFloat, _ H: CGFloat, _ c: ConteudoCard, _ img: UIImage?) {
        let alto = H > 1600
        let corte = (H * (alto ? 0.48 : 0.38)).rounded()
        let yTitulo = corte + (alto ? 250 : 150)
        let yRodape = H - (alto ? 130 : 105)
        arte(ctx, CGRect(x: 0, y: 0, width: W, height: corte), img, corDia: c.cor)
        papel(ctx, CGRect(x: 0, y: corte, width: W, height: H - corte), cor(0xece6da))
        let m: CGFloat = 110, tinta = cor(0x2a2620)
        logoPelaDireita(ctx, W - m, corte + (alto ? 60 : 30), alto ? 108 : 92, tinta)

        let titulo = c.rotulo.uppercased()
        let passagem = "·  \(c.referencia.uppercased())"
        var corpo: CGFloat = 36
        var f = inria(corpo)
        while larguraEspacada(titulo, f, 7) + 14 + larguraEspacada(passagem, f, 5) > W - 2 * m && corpo > 23 { corpo -= 1; f = inria(corpo) }
        espacado(titulo, m, yTitulo, f, tinta, 7)
        espacado(passagem, m + larguraEspacada(titulo, f, 7) + 14, yTitulo, f, tinta.withAlphaComponent(0.55), 5)

        let topo = yTitulo + 56
        let texto = c.aspas ? "“\(c.trecho)”" : c.trecho
        let cx = encaixar(texto, fonte: { inria($0) }, larg: W - 2 * m, alt: yRodape - 110 - topo, max: alto ? 64 : 56, min: 34, entrelinha: alto ? 1.6 : 1.5)
        let ft = inria(cx.t)
        for (i, l) in cx.linhas.enumerated() {
            justificar(l, m, topo + cx.t + CGFloat(i) * cx.lh, W - 2 * m, ultima: i == cx.linhas.count - 1, ft, tinta)
        }
        rodape(W, yRodape, m, c, tinta)
    }

    /// Só texto: papel na cor do dia, faixa floral à esquerda, capitular vermelha de 3 linhas.
    static func soTexto(_ ctx: CGContext, _ W: CGFloat, _ H: CGFloat, _ c: ConteudoCard) {
        papel(ctx, CGRect(x: 0, y: 0, width: W, height: H), cor(corFundo[c.cor] ?? 0xfaf7ee))
        let fw: CGFloat = 110
        faixa(ctx, x: 0, w: fw, h: H)
        logoPelaDireita(ctx, W - 90, 50, 110, vermelho)
        let m = fw + 90, larg = W - m - 90
        let letra = String(c.trecho.prefix(1))
        let resto = String(c.trecho.dropFirst())
        let capL = 3
        var plano: (t: CGFloat, lh: CGFloat, F: CGFloat, recuo: CGFloat, linhas: [String], altura: CGFloat)!
        var t: CGFloat = 68
        while t >= 38 {
            let lh = t * 1.38
            let F = (CGFloat(capL - 1) * lh + 0.68 * t) / 0.662
            let recuo = largura(letra, times(F)) + t * 0.35
            let linhas = quebrar(resto, inria(t), larg, recuo: recuo, comRecuo: capL)
            let n = max(linhas.count, capL)
            plano = (t, lh, F, recuo, linhas, t + CGFloat(n - 1) * lh)
            if plano.altura <= H - 680 { break }
            t -= 2
        }
        let bloco = plano.altura + 170
        let topo = max(250, (H - bloco) / 2 - 30)
        let base0 = topo + plano.t
        escrever(c.rotulo.uppercased(), m, topo - 56, inria(30, negrito: true), UIColor(white: 0, alpha: 0.5))
        escrever(letra, m - plano.F * 0.02, base0 + CGFloat(capL - 1) * plano.lh, times(plano.F), vermelho)
        let ft = inria(plano.t), tinta = cor(0x1c1812)
        for (i, l) in plano.linhas.enumerated() {
            escrever(l, i < capL ? m + plano.recuo : m, base0 + CGFloat(i) * plano.lh, ft, tinta)
        }
        escrever(c.referencia, m, topo + plano.altura + 100, inria(42, italico: true), UIColor(white: 0, alpha: 0.62))
        rodape(W, H - 80, m, c, tinta, mDir: 90)
    }
}

// MARK: Páginas com a leitura inteira (imagem-do-dia.mjs)

enum PaginasDoDia {
    static let W: CGFloat = 1080, PH: CGFloat = 1920
    static let M: CGFloat = 150, MD: CGFloat = 96
    static var LARG: CGFloat { W - M - MD }
    static let tinta = Cards.cor(0x1c1812), suave = Cards.cor(0x1c1812, 0.55), fundo = Cards.cor(0xfbf8f2)
    static let topoPag: CGFloat = 230, pePag: CGFloat = 1920 - 200

    struct Item {
        var h: CGFloat
        var espaco = false
        var junto = 0
        var desenhar: (CGContext, CGFloat) -> Void
    }

    static func limpar(_ l: String) -> String {
        l.replacingOccurrences(of: #"[*†+]"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }
    static func linhasCruas(_ t: String) -> [String] {
        t.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }
    static func ehR(_ l: String) -> Bool { l == "R." || l == "R" }

    static func itensDaLeitura(_ l: Leitura, corpo: CGFloat) -> [Item] {
        let LH = corpo * 1.56
        var itens: [Item] = []
        let nome = l.tipo == "salmo" ? "Salmo responsorial" : l.tipo == "evangelho" ? "Evangelho" : l.rotulo
        let ref = l.referencia.replacingOccurrences(of: #"\s*\(R\..*\)$"#, with: "", options: .regularExpression)
        itens.append(Item(h: 22 + 34, junto: 2) { _, y in
            let x = Cards.espacado(nome.uppercased(), M, y + 22, Cards.inria(22, negrito: true), Cards.vermelho, 4)
            Cards.escrever(ref, x + 16, y + 22, Cards.inria(26, italico: true), suave)
        })
        let normal = Cards.inria(corpo)
        func linha(_ t: String, fonte: UIFont? = nil, cor: UIColor = tinta, justif: Bool = false, ultima: Bool = true) -> Item {
            Item(h: LH) { _, y in
                let f = fonte ?? normal
                if justif { Cards.justificar(t, M, y + corpo, LARG, ultima: ultima, f, cor, maxEspaco: corpo * 1.6) }
                else { Cards.escrever(t, M, y + corpo, f, cor) }
            }
        }
        func espaco(_ h: CGFloat) -> Item { Item(h: h, espaco: true) { _, _ in } }

        if l.tipo == "salmo" {
            let cruas = linhasCruas(l.texto)
            var refrao: [String] = []
            var i = 0
            if let p = cruas.first, ehR(p) {
                i = 1
                while i < cruas.count, !Texto.ehVerso(cruas[i]), !cruas[i].contains("*"), !ehR(cruas[i]) {
                    if cruas[i].range(of: #"^[Oo][Uu]:?$"#, options: .regularExpression) == nil { refrao.append(limpar(cruas[i])) }
                    i += 1
                }
            }
            var estrofes: [[String]] = [[]]
            while i < cruas.count {
                let x = cruas[i]; i += 1
                if Texto.ehVerso(x) { continue }
                if ehR(x) { if !estrofes[estrofes.count - 1].isEmpty { estrofes.append([]) }; continue }
                estrofes[estrofes.count - 1].append(limpar(x))
            }
            let ital = Cards.inria(corpo, italico: true)
            if !refrao.isEmpty {
                Cards.quebrar("R. " + refrao.joined(separator: " "), ital, LARG).forEach { itens.append(linha($0, fonte: ital, cor: Cards.vermelho)) }
                itens.append(espaco(30))
            }
            for (k, e) in estrofes.filter({ !$0.isEmpty }).enumerated() {
                if k > 0 { itens.append(espaco(30)) }
                for v in e { Cards.quebrar(v, normal, LARG).forEach { itens.append(linha($0)) } }
            }
        } else {
            let texto = linhasCruas(l.texto).filter { !Texto.ehVerso($0) }.map(limpar).joined(separator: " ")
            var resto = Substring(texto)
            var aspas = ""
            if let p = resto.first, "“\"«‘'".contains(p) { aspas = String(p); resto = resto.dropFirst() }
            resto = resto.drop(while: \.isWhitespace)
            let letra = resto.first.map(String.init) ?? ""
            let depois = String(resto.dropFirst()).replacingOccurrences(of: #"^\s"#, with: "", options: .regularExpression)
            let capL = 3
            let F = (CGFloat(capL - 1) * LH + 0.68 * corpo) / 0.662
            let recuo = Cards.largura(letra, Cards.times(F)) + corpo * 0.4
            let linhas = Cards.quebrar(depois, normal, LARG, recuo: recuo, comRecuo: capL)
            let ult = linhas.count - 1
            let n = min(capL, linhas.count)
            itens.append(Item(h: CGFloat(capL) * LH) { ctx, y in
                Cards.escrever(letra, M - F * 0.02, y + corpo + CGFloat(capL - 1) * LH, Cards.times(F), Cards.vermelho)
                if !aspas.isEmpty {
                    Cards.escrever(aspas == "\"" ? "“" : aspas, M - F * 0.04, y + corpo + F * 0.12, Cards.times(F * 0.45), Cards.vermelho, direita: true)
                }
                for i in 0..<n {
                    Cards.justificar(linhas[i], M + recuo, y + corpo + CGFloat(i) * LH, LARG - recuo, ultima: i == ult, normal, tinta, maxEspaco: corpo * 1.6)
                }
            })
            if linhas.count > n { for i in n..<linhas.count { itens.append(linha(linhas[i], justif: true, ultima: i == ult)) } }
        }
        let fecho = l.tipo == "evangelho" ? "Palavra da Salvação." : l.tipo == "salmo" ? "" : "Palavra do Senhor."
        if !fecho.isEmpty {
            itens.append(espaco(22))
            itens.append(linha(fecho, fonte: Cards.inria(corpo - 3, italico: true), cor: suave))
        }
        let k = max(0, itens.count - (fecho.isEmpty ? 0 : 2) - 3)
        if itens[k].junto == 0 { itens[k].junto = itens.count - 1 - k }
        return itens
    }

    static func divisor(_ ctx: CGContext, _ y: CGFloat) {
        let cx = M + LARG / 2
        ctx.setStrokeColor(Cards.vermelho.withAlphaComponent(0.45).cgColor); ctx.setLineWidth(1.5)
        ctx.move(to: CGPoint(x: cx - 150, y: y)); ctx.addLine(to: CGPoint(x: cx - 26, y: y))
        ctx.move(to: CGPoint(x: cx + 26, y: y)); ctx.addLine(to: CGPoint(x: cx + 150, y: y)); ctx.strokePath()
        Cards.vermelho.setFill()
        ctx.fill(CGRect(x: cx - 1.5, y: y - 14, width: 3, height: 28))
        ctx.fill(CGRect(x: cx - 9, y: y - 6, width: 18, height: 3))
    }

    struct Cab { let dataCurta: String; let dataLinha: String; let celebracao: String }

    static func cabecalho(_ dia: Dia) -> Cab {
        let d = Datas.data(dia.data) ?? Date()
        let f = DateFormatter(); f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "d 'de' MMMM 'de' yyyy"
        let longa = f.string(from: d)
        f.dateFormat = "EEEE, d 'de' MMMM 'de' yyyy"
        let extenso = f.string(from: d).capitalizedFirst
        let repete = Cabecalho.casa(Cabecalho.semana, dia.celebracao)
        return Cab(dataCurta: Cabecalho.dataCurta(d), dataLinha: repete ? longa : extenso, celebracao: dia.celebracao)
    }

    static func cabecalhoGrande(_ cab: Cab) -> [Item] {
        var itens = [Item(h: 34 + 118 + 54) { _, y in
            Cards.escrever("Liturgia Diária", M, y + 34, Cards.times(34, italico: true), Cards.vermelho)
            Cards.escrever(cab.dataCurta, M - 6, y + 34 + 118, Cards.times(118, italico: true), tinta)
            Cards.escrever(cab.dataLinha, M, y + 34 + 118 + 54, Cards.inria(30), suave)
        }]
        let f = Cards.inria(38, italico: true)
        for (i, t) in Cards.quebrar(cab.celebracao, f, LARG).enumerated() {
            let h: CGFloat = i > 0 ? 50 : 62
            itens.append(Item(h: h) { _, y in Cards.escrever(t, M, y + h, f, tinta) })
        }
        itens.append(Item(h: 90) { _, _ in })
        return itens
    }

    static func cabecalhoPequeno(_ cab: Cab) {
        Cards.escrever("Liturgia Diária", M, 110, Cards.times(32, italico: true), Cards.vermelho)
        let f = Cards.inria(24)
        let linha = [cab.dataLinha, cab.celebracao].filter { !$0.isEmpty }.joined(separator: " · ")
        let primeira = Cards.quebrar(linha, f, LARG).first ?? linha
        Cards.escrever(primeira == linha ? linha : primeira.replacingOccurrences(of: #"[\s,·]+$"#, with: "", options: .regularExpression) + "…", M, 150, f, suave)
    }

    static func rodape(_ cab: Cab, _ i: Int, _ n: Int, _ H: CGFloat) {
        let y = H - 92
        let fd = Cards.times(44, italico: true)
        Cards.escrever(cab.dataCurta, M, y, fd, Cards.vermelho)
        if n > 1 { Cards.escrever("\(i + 1)/\(n)", M + Cards.largura(cab.dataCurta, fd) + 18, y, Cards.inria(24), suave) }
        Cards.escrever(Cards.site, W - MD, y, Cards.inria(24), suave, direita: true)
        Cards.escrever("Textos litúrgicos: CNBB", W - MD, y + 34, Cards.inria(19), suave.withAlphaComponent(0.44), direita: true)
    }

    static func paginar(_ itens: [Item], topo0: CGFloat) -> [[(Item, CGFloat)]] {
        var pags: [[(Item, CGFloat)]] = [[]]
        var y = topo0
        func topo() -> CGFloat { pags.count == 1 ? topo0 : topoPag }
        for (k, it) in itens.enumerated() {
            if it.espaco && y == topo() { continue }
            var precisa = it.h
            if it.junto > 0 { for j in 1...it.junto where k + j < itens.count { precisa += itens[k + j].h } }
            if y + precisa > pePag && y > topo() {
                if it.espaco { continue }
                pags.append([]); y = topoPag
            }
            pags[pags.count - 1].append((it, y))
            y += it.h
        }
        return pags.filter { !$0.isEmpty }
    }

    /// referencia: só aquela leitura; nil: o dia inteiro (a 1ª página abre com a data grande).
    static func paginas(_ dia: Dia, referencia: String?, pintura: UIImage?) -> [UIImage] {
        let cab = cabecalho(dia)
        let leituras = dia.leituras.filter { !$0.alternativa && ["leitura", "salmo", "evangelho"].contains($0.tipo) }
            .filter { referencia == nil || $0.referencia == referencia }
        func montar(_ grande: Bool, _ corpo: CGFloat) -> [[(Item, CGFloat)]] {
            var itens = grande ? cabecalhoGrande(cab) : []
            for (i, l) in leituras.enumerated() {
                if i > 0 { itens.append(Item(h: 150, espaco: true) { ctx, y in divisor(ctx, y + 75) }) }
                itens += itensDaLeitura(l, corpo: corpo)
            }
            return paginar(itens, topo0: grande ? 110 : topoPag)
        }
        let opcoes: [(Bool, CGFloat)] = [true, false].flatMap { g in [36, 34, 32].map { (g, CGFloat($0)) } }
        let tentativas = opcoes.map { (o: $0, p: montar($0.0, $0.1)) }
        let menor = tentativas.map(\.p.count).min() ?? 1
        let escolha = tentativas.first { $0.p.count == menor }!
        let pags = escolha.p, grande = escolha.o.0
        return pags.enumerated().map { i, pag in
            let fim = pag.map { $0.1 + $0.0.h }.max() ?? 0
            let H = pags.count == 1 ? min(PH, max(1350, ceil(fim + 230))) : PH
            return Cards.render(CGSize(width: W, height: H)) { ctx in
                fundo.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
                Cards.faixa(ctx, x: 24, w: 70, h: H, alfa: 0.85)
                if i > 0 || !grande { cabecalhoPequeno(cab) }
                for (it, y) in pag { it.desenhar(ctx, y) }
                let l0 = fim + 50, l1 = H - 150
                if let pintura, l1 - l0 >= 260 {
                    let r = CGRect(x: M, y: l0, width: W - MD - M, height: l1 - l0)
                    ctx.saveGState()
                    UIBezierPath(roundedRect: r, cornerRadius: 18).addClip()
                    let e = max(r.width / pintura.size.width, r.height / pintura.size.height)
                    let w = pintura.size.width * e, h = pintura.size.height * e
                    pintura.draw(in: CGRect(x: r.minX + (r.width - w) / 2, y: r.maxY - h, width: w, height: h))
                    ctx.restoreGState()
                }
                rodape(cab, i, pags.count, H)
            }
        }
    }
}
