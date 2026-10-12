import SwiftUI
import UIKit

/// Prosa da leitura com a capitular do site (.capitular): letra Times vermelha de 4 linhas,
/// com o texto contornando-a; números de versículo pequenos, vermelhos e elevados (.vers-num).
struct ProsaCapitular: UIViewRepresentable {
    let texto: String
    var tamanho: CGFloat = 16

    func makeUIView(context: Context) -> CaixaCapitular { CaixaCapitular() }

    func updateUIView(_ v: CaixaCapitular, context: Context) {
        let (letra, corpo) = Self.montar(texto, tamanho)
        v.configurar(letra: letra, corpo: corpo, entrelinha: tamanho * 1.6, tamanho: tamanho)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: CaixaCapitular, context: Context) -> CGSize? {
        let w = proposal.width ?? 300
        return CGSize(width: w, height: uiView.altura(para: w))
    }

    /// Separa a primeira letra (com a pontuação de abertura) e monta o resto com os versículos.
    static func montar(_ texto: String, _ t: CGFloat) -> (String, NSAttributedString) {
        let estilo = NSMutableParagraphStyle()
        estilo.minimumLineHeight = t * 1.6
        estilo.maximumLineHeight = t * 1.6
        let base: [NSAttributedString.Key: Any] = [
            .font: Estilo.uiLeitura(t), .foregroundColor: UIColor.black.withAlphaComponent(0.67), .paragraphStyle: estilo,
            .baselineOffset: t * 0.18,
        ]
        var sup = base
        sup[.font] = Estilo.uiLeitura(t * 0.66)
        sup[.foregroundColor] = Estilo.uiVermelho
        sup[.baselineOffset] = t * 0.18 + t * 0.36

        let saida = NSMutableAttributedString()
        var letra = ""
        for bruta in texto.split(separator: "\n", omittingEmptySubsequences: true) {
            let l = bruta.trimmingCharacters(in: .whitespaces)
            if l.isEmpty { continue }
            if Texto.ehVerso(l) { saida.append(NSAttributedString(string: l + "\u{2009}", attributes: sup)); continue }
            var corpo = l
            if letra.isEmpty, let i = corpo.firstIndex(where: { $0.isLetter }) {
                letra = String(corpo[corpo.startIndex...i]).trimmingCharacters(in: .whitespaces).uppercased()
                corpo = String(corpo[corpo.index(after: i)...])
            }
            saida.append(NSAttributedString(string: corpo + " ", attributes: base))
        }
        return (letra, saida)
    }
}

final class CaixaCapitular: UIView {
    private let texto = UITextView()
    private let capitular = UILabel()
    private var entrelinha: CGFloat = 25.6
    private var linhas: CGFloat = 4
    private var fonteCap = UIFont.systemFont(ofSize: 100)

    override init(frame: CGRect) {
        super.init(frame: frame)
        texto.isScrollEnabled = false
        texto.isEditable = false
        texto.isSelectable = true
        texto.backgroundColor = .clear
        texto.textContainerInset = .zero
        texto.textContainer.lineFragmentPadding = 0
        addSubview(texto)
        capitular.textColor = Estilo.uiVermelho
        addSubview(capitular)
        backgroundColor = .clear
    }
    required init?(coder: NSCoder) { fatalError() }

    func configurar(letra: String, corpo: NSAttributedString, entrelinha: CGFloat, tamanho: CGFloat) {
        self.entrelinha = entrelinha
        // --cap-f: (3 linhas + base - topo) / altura da maiúscula do Times
        let f = (3 * entrelinha + entrelinha * 0.735 - entrelinha * 0.31) / 0.662
        let fonte = Estilo.uiCapitular(f)
        fonteCap = fonte
        let cap = NSMutableAttributedString(string: letra, attributes: [.font: fonte, .foregroundColor: Estilo.uiVermelho])
        if letra.count > 1 {   // aspas/parêntese de abertura: pequenos, antes da letra
            cap.addAttribute(.font, value: Estilo.uiCapitular(f * 0.32), range: NSRange(location: 0, length: letra.count - 1))
        }
        capitular.attributedText = cap
        capitular.isHidden = letra.isEmpty
        texto.attributedText = corpo
        setNeedsLayout()
    }

    private func larguraCapitular() -> CGFloat {
        capitular.isHidden ? 0 : ceil(capitular.intrinsicContentSize.width + fonteCap.pointSize * 0.06)
    }

    private func ajustar(_ w: CGFloat) {
        let cw = larguraCapitular()
        texto.textContainer.exclusionPaths = cw > 0 ? [UIBezierPath(rect: CGRect(x: 0, y: 0, width: cw, height: linhas * entrelinha - 1))] : []
        texto.frame = CGRect(x: 0, y: 0, width: w, height: 10_000)
        texto.textContainer.size = CGSize(width: w, height: .greatestFiniteMagnitude)
    }

    func altura(para w: CGFloat) -> CGFloat {
        ajustar(w)
        let lm = texto.layoutManager
        lm.ensureLayout(for: texto.textContainer)
        let h = lm.usedRect(for: texto.textContainer).height + 2
        return ceil(max(h, capitular.isHidden ? 0 : linhas * entrelinha))
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        ajustar(bounds.width)
        texto.frame = CGRect(x: 0, y: 0, width: bounds.width, height: max(bounds.height, 1))
        // A linha de base da letra encosta na linha de base da 4ª linha do texto.
        let lm = texto.layoutManager
        lm.ensureLayout(for: texto.textContainer)
        var base: CGFloat = linhas * entrelinha - entrelinha * 0.265
        var n = 0
        lm.enumerateLineFragments(forGlyphRange: NSRange(location: 0, length: lm.numberOfGlyphs)) { r, _, _, g, stop in
            n += 1
            if n == Int(self.linhas) {
                base = r.minY + lm.location(forGlyphAt: g.location).y
                stop.pointee = true
            }
        }
        let tam = capitular.intrinsicContentSize
        capitular.frame = CGRect(x: 0, y: base - fonteCap.ascender, width: tam.width, height: tam.height)
    }
}
