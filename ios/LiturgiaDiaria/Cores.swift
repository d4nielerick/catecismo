import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Cores litúrgicas, as mesmas de render.mjs (COR_PONTO / COR_FUNDO).
enum CorLiturgica {
    static func ponto(_ cor: String) -> Color {
        switch cor {
        case "roxo": return Color(hex: 0x7c3aed)
        case "verde": return Color(hex: 0x15803d)
        case "vermelho": return Color(hex: 0xdc2626)
        case "rosa": return Color(hex: 0xdb2777)
        case "preto": return Color(hex: 0x44403c)
        default: return Color(hex: 0xb8972e)   // branco
        }
    }
    static func fundo(_ cor: String) -> Color {
        switch cor {
        case "roxo": return Color(hex: 0xf0ecf8)
        case "verde": return Color(hex: 0xedf5ef)
        case "vermelho": return Color(hex: 0xf8edeb)
        case "rosa": return Color(hex: 0xf8edf2)
        case "preto": return Color(hex: 0xeeeceb)
        default: return Color(hex: 0xfaf7ee)
        }
    }
}
