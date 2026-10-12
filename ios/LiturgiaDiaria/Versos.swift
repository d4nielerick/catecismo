import Foundation

/// A leitura em versículos para escolher o trecho do card (compartilhar.mjs → prepararVersos).
/// Versículo que termina no meio da frase puxa o seguinte; o que começa em minúscula puxa o
/// anterior: o card nunca sai com uma frase pela metade. O refrão do salmo vai sempre sozinho.
struct Versos {
    struct Unidade: Identifiable {
        let id: Int
        let n: String
        let cap: String
        let texto: String
        var ref: String? = nil
    }
    static let maximo = 280

    private(set) var unidades: [Unidade] = []
    private var livro = ""

    static func limpar(_ l: String) -> String {
        l.replacingOccurrences(of: #"[*†+]"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    private static func casa(_ p: String, _ s: String) -> Bool { s.range(of: p, options: .regularExpression) != nil }

    /// `referencia`: sem o "(R. …)"; `completa`: a do JSON.
    init(leitura: Leitura, referencia ref: String, completa: String) {
        guard let rx = try? NSRegularExpression(pattern: #"^(.*?)(\d+(?:\(\d+\))?),"#),
              let m = rx.firstMatch(in: ref, range: NSRange(ref.startIndex..., in: ref)),
              let r1 = Range(m.range(at: 1), in: ref) else { return }
        livro = String(ref[r1])
        let resto = String(ref[r1.upperBound...])
        let rxCap = try! NSRegularExpression(pattern: #"(\d+(?:\(\d+\))?),"#)
        let caps = rxCap.matches(in: resto, range: NSRange(resto.startIndex..., in: resto)).compactMap { Range($0.range(at: 1), in: resto).map { String(resto[$0]) } }
        var ci = 0, antes = 0, noRefrao = false
        var refrao: [String] = []
        var brutas: [(n: String, cap: String, linhas: [String])] = []
        for cru in leitura.texto.split(separator: "\n") {
            let l = cru.trimmingCharacters(in: .whitespaces)
            if l.isEmpty { continue }
            if Self.casa(#"^R\.?$"#, l) { noRefrao = brutas.isEmpty && refrao.isEmpty; continue }
            if Self.casa(#"^(?i)(V\.?|Ou:?)$"#, l) { continue }
            if Texto.ehVerso(l) && !Self.casa(#"^[a-z]$"#, l) {
                noRefrao = false
                var n = l, cap = caps.indices.contains(ci) ? caps[ci] : ""
                if l.contains(",") {
                    let p = l.split(separator: ",").map(String.init)
                    cap = p[0]; n = p.count > 1 ? p[1] : ""
                    ci = max(0, caps.firstIndex(of: cap) ?? -1)
                } else {
                    let num = Int(l.prefix(while: \.isNumber)) ?? 0
                    if num < antes && ci < caps.count - 1 { ci += 1; cap = caps[ci] }
                    antes = num
                }
                brutas.append((n, cap, []))
                continue
            }
            if noRefrao { refrao.append(l) } else if !brutas.isEmpty { brutas[brutas.count - 1].linhas.append(l) }
        }
        var us = brutas.filter { !$0.linhas.isEmpty }.map { (n: $0.n, cap: $0.cap, texto: Self.limpar($0.linhas.joined(separator: " "))) }
        var refU: (String, String, String, String?)? = nil
        if !refrao.isEmpty && leitura.tipo == "salmo" {
            var r = ""
            if let rr = completa.range(of: #"\(R\.\s*([^)]*)\)"#, options: .regularExpression) {
                r = String(completa[rr]).replacingOccurrences(of: #"^\(R\.\s*|\)$"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
            }
            let refR = Self.casa("[A-Za-z]", r) ? r : !r.isEmpty ? "\(livro)\(caps.first ?? ""),\(r)" : ref
            refU = ("R.", "", Self.limpar(refrao.joined(separator: " ")), refR)
        }
        var lista: [Unidade] = []
        if let refU { lista.append(Unidade(id: 0, n: refU.0, cap: refU.1, texto: refU.2, ref: refU.3)) }
        for u in us { lista.append(Unidade(id: lista.count, n: u.n, cap: u.cap, texto: u.texto)) }
        us.removeAll()
        unidades = lista
    }

    var vazio: Bool { unidades.isEmpty }

    func efetivo(_ a0: Int, _ b0: Int) -> (Int, Int) {
        var a = a0, b = b0
        if unidades[a].n == "R." || unidades[b].n == "R." { return (a, a) }
        let primeiro = unidades[0].n == "R." ? 1 : 0
        while b < unidades.count - 1 && !Self.casa(#"[.!?…]["”']?$"#, unidades[b].texto) { b += 1 }
        while a > primeiro && Self.casa(#"^["“']?[a-zà-ú]"#, unidades[a].texto) { a -= 1 }
        return (a, b)
    }

    func texto(_ a: Int, _ b: Int) -> String {
        var t = unidades[a...b].map(\.texto).joined(separator: " ")
        if t.filter({ $0 == "\"" }).count % 2 == 1 { t = t.replacingOccurrences(of: "\"", with: "") }
        t = t.replacingOccurrences(of: #"[,;:]$"#, with: ".", options: .regularExpression)
        return t.capitalizedFirst
    }

    func referencia(_ a: Int, _ b: Int) -> String {
        let ua = unidades[a], ub = unidades[b]
        if ua.n == "R.", let r = ua.ref { return r }
        if ua.cap == ub.cap { return "\(livro)\(ua.cap),\(ua.n)\(a == b ? "" : "-\(ub.n)")" }
        return "\(livro)\(ua.cap),\(ua.n)–\(ub.cap),\(ub.n)"
    }

    /// Os versículos que contêm o trecho escolhido para o dia.
    func achar(_ trecho: String) -> (Int, Int)? {
        func norm(_ s: String) -> String {
            s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { CharacterSet.letters.contains($0) && $0.isASCII }
                .map(String.init).joined().lowercased()
        }
        let t = norm(trecho)
        guard !t.isEmpty else { return nil }
        let ini = String(t.prefix(24)), fim = String(t.suffix(24))
        let textos = unidades.map { norm($0.texto) }
        guard let a = textos.firstIndex(where: { $0.contains(ini) }), let b = textos.firstIndex(where: { $0.contains(fim) }), b >= a else { return nil }
        return (a, b)
    }
}
