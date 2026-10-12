import Foundation

/// Uma linha do texto da leitura: número de versículo, refrão do salmo ou texto corrido.
enum Trecho: Equatable {
    case verso(String)
    case refrao(String)
    case linha(String)
}

enum Texto {
    /// Mesma regra de render.mjs (VERSO): "12", "12b", "3,4a" ou uma letra solta ("b") são marcas de versículo.
    static let verso = try! NSRegularExpression(pattern: #"^(\d+[a-z]?|\d+,\d+[a-z]?|[a-z])$"#)

    static func ehVerso(_ s: String) -> Bool {
        verso.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    /// Quebra o texto cru em trechos. Na prosa o chamador junta as linhas; no salmo cada linha é um verso.
    static func trechos(_ texto: String) -> [Trecho] {
        var saida: [Trecho] = []
        var emRefrao = false
        for bruta in texto.split(separator: "\n", omittingEmptySubsequences: true) {
            let l = bruta.trimmingCharacters(in: .whitespaces)
            if l.isEmpty { continue }
            if l == "R." || l == "R" { emRefrao = true; continue }   // "R." sozinho abre o refrão
            if ehVerso(l) { saida.append(.verso(l)); emRefrao = false; continue }
            if l.hasPrefix("R. ") { saida.append(.refrao(String(l.dropFirst(3)))); continue }
            saida.append(emRefrao ? .refrao(l) : .linha(l))
        }
        return saida
    }
}
