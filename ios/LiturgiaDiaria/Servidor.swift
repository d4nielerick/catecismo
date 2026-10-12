import Foundation

/// Lê o que o site já publica. O app não tem servidor próprio: tudo vem de santadoutrina.com.
actor Servidor {
    static let compartilhado = Servidor()
    static let base = URL(string: "https://santadoutrina.com")!

    private let sessao: URLSession
    private let pasta: URL
    private var memoria: [String: Dia] = [:]

    init(sessao: URLSession = .shared) {
        self.sessao = sessao
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        pasta = caches.appendingPathComponent("liturgia", isDirectory: true)
        try? FileManager.default.createDirectory(at: pasta, withIntermediateDirectories: true)
    }

    /// Leituras de um dia ("AAAA-MM-DD"). Usa o cache do aparelho se a rede falhar (as leituras de um dia não mudam).
    func dia(_ chave: String) async throws -> Dia {
        if let d = memoria[chave] { return d }
        let arquivo = pasta.appendingPathComponent("\(chave).json")
        if let dados = try? Data(contentsOf: arquivo), let d = try? JSONDecoder().decode(Dia.self, from: dados) {
            memoria[chave] = d
            return d
        }
        let url = Self.base.appendingPathComponent("data/liturgia/\(chave).json")
        let (dados, resp) = try await sessao.data(from: url)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        let d = try JSONDecoder().decode(Dia.self, from: dados)
        try? dados.write(to: arquivo, options: .atomic)
        memoria[chave] = d
        return d
    }

    /// Pontinhos do calendário (santos e Nossa Senhora). Cache em disco: muda pouco.
    func indice() async -> Indice? {
        let arquivo = pasta.appendingPathComponent("indice.json")
        let url = Self.base.appendingPathComponent("data/liturgia/indice.json")
        if let (dados, resp) = try? await sessao.data(from: url), (resp as? HTTPURLResponse)?.statusCode == 200,
           let i = try? JSONDecoder().decode(Indice.self, from: dados) {
            try? dados.write(to: arquivo, options: .atomic)
            return i
        }
        return (try? Data(contentsOf: arquivo)).flatMap { try? JSONDecoder().decode(Indice.self, from: $0) }
    }

    static func urlAudio(dia: String, nome: String) -> URL {
        base.appendingPathComponent("data/liturgia-audio/\(dia)/\(nome).mp3")
    }

    /// O áudio só existe para os dias em que a voz já foi gerada.
    func temAudio(dia: String, nome: String) async -> Bool {
        var req = URLRequest(url: Self.base.appendingPathComponent("data/liturgia-audio/\(dia)/\(nome).json"))
        req.httpMethod = "HEAD"
        return ((try? await sessao.data(for: req).1) as? HTTPURLResponse)?.statusCode == 200
    }
}
