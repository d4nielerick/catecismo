import Foundation

/// Um dia da Liturgia: o mesmo JSON que o site serve em /data/liturgia/AAAA-MM-DD.json.
struct Dia: Codable, Equatable {
    let data: String
    let tempo: String
    let cor: String
    let celebracao: String
    let missas: [Missa]

    /// Leituras da primeira missa (a do dia). Natal e a Vigília Pascal têm várias missas.
    var leituras: [Leitura] { missas.first?.leituras ?? [] }
}

struct Missa: Codable, Equatable {
    let leituras: [Leitura]
}

struct Leitura: Codable, Equatable, Identifiable {
    let tipo: String          // leitura | salmo | aclamacao | evangelho | sequencia
    let rotulo: String        // "1ª Leitura", "Salmo", "Evangelho"…
    let referencia: String
    let texto: String

    var id: String { "\(rotulo)|\(referencia)|\(texto.prefix(24))" }

    // Sequência e algumas aclamações vêm sem referência no JSON.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tipo = try c.decode(String.self, forKey: .tipo)
        rotulo = try c.decode(String.self, forKey: .rotulo)
        referencia = try c.decodeIfPresent(String.self, forKey: .referencia) ?? ""
        texto = try c.decode(String.self, forKey: .texto)
    }

    /// Nome do arquivo de áudio em /data/liturgia-audio/<dia>/<nome>.mp3 (nil: não tem voz).
    func nomeAudio(entre todas: [Leitura]) -> String? {
        switch tipo {
        case "evangelho": return todas.first(where: { $0.tipo == "evangelho" }) == self ? "evangelho" : nil
        case "salmo": return todas.first(where: { $0.tipo == "salmo" }) == self ? "salmo" : nil
        case "leitura":
            let ls = todas.filter { $0.tipo == "leitura" }
            if ls.first == self { return "primeira-leitura" }
            if ls.count > 1, ls[1] == self { return "segunda-leitura" }
            return nil
        default: return nil
        }
    }
}

enum Datas {
    static let calendario: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "pt_BR")
        return c
    }()

    static let chave: DateFormatter = {
        let f = DateFormatter()
        f.calendar = calendario
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let longa: DateFormatter = {
        let f = DateFormatter()
        f.calendar = calendario
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "EEEE, d 'de' MMMM"
        return f
    }()

    static func chave(_ d: Date) -> String { chave.string(from: d) }
    static func data(_ chave: String) -> Date? { self.chave.date(from: chave) }
    static func longa(_ d: Date) -> String { longa.string(from: d).capitalizedFirst }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
