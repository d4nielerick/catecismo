import Foundation
import UIKit

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
        pasta = caches.appendingPathComponent("liturgia-v2", isDirectory: true)   // v2: descarta dias guardados antes de 13/10 (São Carlo Acutis)
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

    // MARK: Outros arquivos do site (resumo, trechos, santos, comentário, pinturas)

    private var json: [String: Data] = [:]
    private var imagens: [String: UIImage] = [:]

    private func arquivoCache(_ caminho: String) -> URL {
        pasta.appendingPathComponent(caminho.replacingOccurrences(of: "/", with: "_"))
    }

    /// Um JSON do site. `fixo`: o arquivo não muda (ou muda pouco), então o disco basta e a rede
    /// só é usada na falta dele; senão a rede vem primeiro e o disco cobre a falta de conexão.
    /// 404 vira nil (dia sem resumo, sem trecho…), e o nil não fica guardado.
    func dados(_ caminho: String, fixo: Bool = false) async -> Data? {
        if let d = json[caminho] { return d }
        let arquivo = arquivoCache(caminho)
        if fixo, let d = try? Data(contentsOf: arquivo) { json[caminho] = d; return d }
        var req = URLRequest(url: Self.base.appendingPathComponent(caminho))
        req.timeoutInterval = 12
        if let (d, resp) = try? await sessao.data(for: req), let http = resp as? HTTPURLResponse {
            if http.statusCode == 200 {
                try? d.write(to: arquivo, options: .atomic)
                json[caminho] = d
                return d
            }
            if http.statusCode == 404 { try? FileManager.default.removeItem(at: arquivo); return nil }
        }
        return try? Data(contentsOf: arquivo)
    }

    func objeto<T: Decodable>(_ tipo: T.Type, _ caminho: String, fixo: Bool = false) async -> T? {
        guard let d = await dados(caminho, fixo: fixo) else { return nil }
        return try? JSONDecoder().decode(T.self, from: d)
    }

    /// Imagem (as pinturas dos cards são .webp; a do santo vem da Wikipédia, com URL inteira).
    func imagem(_ caminhoOuURL: String) async -> UIImage? {
        if let i = imagens[caminhoOuURL] { return i }
        let externo = caminhoOuURL.hasPrefix("http")
        let arquivo = arquivoCache(externo ? "ext-\(abs(caminhoOuURL.hashValue))" : caminhoOuURL)
        var dados = try? Data(contentsOf: arquivo)
        if dados == nil {
            guard let url = externo ? URL(string: caminhoOuURL) : Self.base.appendingPathComponent(caminhoOuURL) else { return nil }
            var req = URLRequest(url: url)
            req.setValue("LiturgiaDiaria-iOS/1.0 (santadoutrina.com)", forHTTPHeaderField: "User-Agent")
            if let (d, r) = try? await sessao.data(for: req), (r as? HTTPURLResponse)?.statusCode == 200 {
                dados = d
                if !externo { try? d.write(to: arquivo, options: .atomic) }
            }
        }
        guard let dados, let img = UIImage(data: dados) else { return nil }
        imagens[caminhoOuURL] = img
        return img
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
