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

    /// blocosDaMissa (render.mjs): a leitura "à escolha" (alternativa) entra no bloco da anterior,
    /// então a Páscoa, com duas 2ª Leituras e dois Evangelhos, tem um bloco (e uma aba) de cada.
    var blocos: [Bloco] {
        var bs: [Bloco] = []
        for l in leituras {
            if l.alternativa, !bs.isEmpty { bs[bs.count - 1].alternativas.append(l); continue }
            bs.append(Bloco(leitura: l, alternativas: []))
        }
        return bs
    }
}

/// Uma leitura da página com as suas alternativas ("ou…").
struct Bloco: Identifiable {
    let leitura: Leitura
    var alternativas: [Leitura]
    var id: String { leitura.id }
    /// itensDasAbas: a aclamação e a sequência não ganham aba.
    var temAba: Bool { !["aclamacao", "sequencia"].contains(leitura.tipo) }
}

struct Missa: Codable, Equatable {
    let leituras: [Leitura]
}

struct Leitura: Codable, Equatable, Identifiable {
    let tipo: String          // leitura | salmo | aclamacao | evangelho | sequencia
    let rotulo: String        // "1ª Leitura", "Salmo", "Evangelho"…
    let referencia: String
    let texto: String
    let titulo: String?
    let alternativa: Bool     // "à escolha": outra opção para a leitura anterior

    var id: String { "\(rotulo)|\(referencia)|\(texto.prefix(24))" }

    // Sequência e algumas aclamações vêm sem referência no JSON.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tipo = try c.decode(String.self, forKey: .tipo)
        rotulo = try c.decode(String.self, forKey: .rotulo)
        referencia = try c.decodeIfPresent(String.self, forKey: .referencia) ?? ""
        texto = try c.decode(String.self, forKey: .texto)
        titulo = try c.decodeIfPresent(String.self, forKey: .titulo)
        alternativa = try c.decodeIfPresent(Bool.self, forKey: .alternativa) ?? false
    }

    /// Nome do arquivo de áudio em /data/liturgia-audio/<dia>/<nome>.mp3 (nil: não tem voz).
    func nomeAudio(entre todas: [Leitura]) -> String? {
        guard !alternativa else { return nil }
        let todas = todas.filter { !$0.alternativa }
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

/// data/liturgia/indice.json: só os "destaques" (pontinhos do calendário).
struct Indice: Codable {
    struct Destaque: Codable { let data: String; let tipo: String; let nome: String }
    let destaques: [Destaque]
    /// Primeiro e último dia com leituras ("AAAA-MM-DD"): as setas de dia param nas pontas.
    let inicio: String?
    let fim: String?
}

/// O cabeçalho do dia, com as mesmas regras de cabecalhoDoDia (render.mjs).
enum Cabecalho {
    static let mesCurto = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    static let temporal = try! NSRegularExpression(pattern: #"^(?:\d+º Domingo\b|\d+º dia da Oitava|(?:Domingo|Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado) (?:da \d+ª Semana|depois d|da Oitava|do Tempo do Natal))"#)
    static let semana = try! NSRegularExpression(pattern: #"\b(?:Domingo|Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado)\b"#)

    static func casa(_ r: NSRegularExpression, _ s: String) -> Bool {
        r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    static func dataCurta(_ d: Date) -> String {
        let c = Datas.calendario.dateComponents([.day, .month], from: d)
        return "\(c.day!)/\(mesCurto[c.month! - 1])"
    }

    static let semanaF: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "pt_BR"); f.dateFormat = "EEEE"; return f
    }()

    /// (linha de baixo da data, nome da celebração)
    static func linhas(_ d: Date, _ dia: Dia?) -> (String, String) {
        let diaSemana = semanaF.string(from: d).capitalizedFirst
        guard let dia else { return (diaSemana, "") }
        let cel = dia.celebracao
        let ehTemporal = casa(temporal, cel)
        var linha = [diaSemana, dia.tempo].filter { !$0.isEmpty }.joined(separator: " · ")
        if ehTemporal { linha = cel } else if casa(semana, cel) { linha = dia.tempo }
        return (linha, ehTemporal ? "" : cel)
    }
}
