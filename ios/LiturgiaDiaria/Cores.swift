import SwiftUI
import UIKit

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

/// Os tokens de liturgiadiaria.css (:root), para o app ter a cara do site.
enum Estilo {
    static let fundo = Color(hex: 0xfcfaf7)
    static let tinta = Color.black
    static let texto = Color.black.opacity(0.67)
    static let suave = Color.black.opacity(0.6)
    static let linha = Color.black.opacity(0.08)
    static let vermelho = Color(hex: 0xcb2e2e)
    static let uiVermelho = UIColor(red: 203 / 255, green: 46 / 255, blue: 46 / 255, alpha: 1)

    /// Margens do celular: a moldura ocupa 26pt de cada lado, o texto começa a 50pt.
    static let lado: CGFloat = 50

    // Fontes: título em Times itálico (--font-titulo), leitura em Inria Serif (--font-leitura).
    static func titulo(_ t: CGFloat) -> Font { .custom("TimesNewRomanPS-ItalicMT", fixedSize: t) }
    static func leitura(_ t: CGFloat) -> Font { .custom("InriaSerif-Regular", fixedSize: t) }
    static func leituraItalico(_ t: CGFloat) -> Font { .custom("InriaSerif-Italic", fixedSize: t) }
    static func sans(_ t: CGFloat, _ peso: Font.Weight = .regular) -> Font { .system(size: t, weight: peso) }

    static func uiLeitura(_ t: CGFloat) -> UIFont { UIFont(name: "InriaSerif-Regular", size: t) ?? .systemFont(ofSize: t) }
    static func uiCapitular(_ t: CGFloat) -> UIFont { UIFont(name: "TimesNewRomanPSMT", size: t) ?? .systemFont(ofSize: t) }
}

/// Cores litúrgicas, as mesmas de render.mjs e do CSS da fita.
enum CorLiturgica {
    /// COR_TITULO: tom pastel para "Liturgia Diária".
    static func titulo(_ cor: String) -> Color {
        switch cor {
        case "roxo": return Color(hex: 0x9585b3)
        case "verde": return Color(hex: 0x7ba287)
        case "vermelho": return Color(hex: 0xcc8b82)
        case "rosa": return Color(hex: 0xd7a3b5)
        case "preto": return Color(hex: 0x8a837c)
        default: return Color(hex: 0xc9b27a)
        }
    }
    /// .lp-fita[data-cor]: (fundo, costura, borda)
    static func fita(_ cor: String) -> (Color, Color, Color) {
        let costura = Color.white.opacity(0.35)
        switch cor {
        case "roxo": return (Color(hex: 0x5b2d86), costura, .clear)
        case "verde": return (Color(hex: 0x1f6e3d), costura, .clear)
        case "vermelho": return (Color(hex: 0xb8282a), costura, .clear)
        case "rosa": return (Color(hex: 0xd67d9e), costura, .clear)
        case "preto": return (Color(hex: 0x262422), costura, .clear)
        default: return (Color(hex: 0xf5eedc), Color(hex: 0xb8972e), Color(hex: 0xb8972e, alpha: 0.6))
        }
    }
}
