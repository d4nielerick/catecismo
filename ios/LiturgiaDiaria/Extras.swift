import Foundation

// Os outros arquivos que a página do dia lê (liturgiadiaria.js), com os mesmos nomes de campo.

extension Dia {
    /// referenciasDoDia (render.mjs): as referências que o resumo, os trechos e o comentário cobrem.
    /// Se as leituras do dia mudarem, esses arquivos deixam de valer.
    var assinatura: String {
        leituras.filter { !$0.alternativa && ["leitura", "salmo", "evangelho"].contains($0.tipo) }
            .map(\.referencia).joined(separator: " | ")
    }
}

/// data/liturgia-resumos/AAAA-MM-DD.json
struct Resumo: Decodable {
    let leituras: String
    let texto: String
}

/// data/liturgia-trechos/AAAA-MM-DD.json: o trecho de cada leitura escolhido para o card e a pintura.
struct Trechos: Decodable {
    let leituras: String
    let trechos: [String: String]?
    let imagens: [String: String]?
}

/// data/cards-imagens.json: o acervo de pinturas dos cards.
struct CatalogoCards: Decodable {
    struct Pintura: Decodable, Identifiable, Equatable {
        let id: String
        let titulo: String
        let tempos: [String]
        let cores: [String]
        var caminho: String { "assets/img/cards/\(id).webp" }
        var mini: String { "assets/img/cards/mini/\(id).webp" }
    }
    let imagens: [Pintura]

    /// escolherFotos (compartilhar.mjs): a preferida, até 6 que batem o tempo (+2) e a cor (+1) e até
    /// 4 neutras; cada grupo gira com a data, para o card não abrir sempre com a mesma pintura.
    func escolher(tempo: String, cor: String, dt: String, preferida: String?, maxDoDia: Int = 6, maxNeutras: Int = 4) -> [Pintura] {
        let diaDoAno = Int(((Datas.data(dt)?.timeIntervalSince1970 ?? 0) / 86400).rounded())
        func girar(_ a: [Pintura]) -> [Pintura] {
            guard !a.isEmpty else { return a }
            let k = ((diaDoAno % a.count) + a.count) % a.count
            return Array(a[k...] + a[..<k])
        }
        func nota(_ p: Pintura) -> Int { (p.tempos.contains(tempo) ? 2 : 0) + (p.cores.contains(cor) ? 1 : 0) }
        let doDia = imagens.filter { nota($0) > 0 }.enumerated().sorted { a, b in
            nota(a.element) != nota(b.element) ? nota(a.element) > nota(b.element) : a.offset < b.offset
        }.map(\.element)
        let melhores = doDia.filter { nota($0) == nota(doDia[0]) }
        let ordem = Array((girar(melhores) + doDia.dropFirst(melhores.count)).prefix(maxDoDia))
        // neutras: o grupo anda `maxNeutras` por dia (e não 1), como no site
        let todasNeutras = imagens.filter { $0.tempos.contains("todos") }
        let kn = todasNeutras.isEmpty ? 0 : (((diaDoAno * maxNeutras) % todasNeutras.count) + todasNeutras.count) % todasNeutras.count
        let neutras = Array((Array(todasNeutras[kn...]) + Array(todasNeutras[..<kn])).prefix(maxNeutras))
        let pref = preferida.flatMap { p in imagens.first { $0.id == p } }
        var vistos = Set<String>()
        return ((pref.map { [$0] } ?? []) + ordem + neutras).filter { vistos.insert($0.id).inserted }
    }
}

/// data/santos-frases.json
struct SantosFrases: Decodable {
    struct Frase: Decodable {
        let nome: String?
        let frase: String
        let imagem: String?
    }
    let frases: [String: Frase]?
    let porData: [String: Frase]?
}

/// data/santos/<slug>.json: o resumo da Wikipédia sobre a celebração.
struct Sobre: Decodable {
    struct Artigo: Decodable, Identifiable {
        struct Imagem: Decodable { let src: String; let largura: Double?; let altura: Double? }
        let titulo: String
        let url: String
        let resumo: [String]
        let imagem: Imagem?
        var id: String { url }
    }
    let celebracao: String?
    let artigos: [Artigo]
}

/// data/liturgia-comentario/AAAA-MM-DD.json
struct Comentario: Decodable {
    struct Ref: Decodable { let ev: String; let cap: Int; let lectio: Int; let versos: [Int]? }
    struct Paragrafo: Decodable { let numero: Int; let frase: String }
    struct Destaque: Decodable { let lectio: Int; let i: Int }
    let evangelho: String
    let leituras: String
    let catena: [Ref]?
    let catecismo: [Paragrafo]?
    let tema: String?
    let destaques: [Destaque]?
}

/// data/catena/<Ev>/<NN>.json: as lectiones do capítulo.
struct Lectio: Decodable {
    struct Item: Decodable {
        let autor: String
        let obra: String?
        let latim: String?
        let pt: String?
    }
    let lectio: Int
    let versos: [Int]?
    let itens: [Item]
}

/// data/catena-autores.json (a chave "_" é um comentário: decodifica só o que é autor).
struct Autor: Decodable {
    let nome: String
    let quando: String?
    let quem: String?
}

enum Autores {
    static func ler(_ d: Data) -> [String: Autor] {
        guard let bruto = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
        var saida: [String: Autor] = [:]
        for (k, v) in bruto {
            guard let o = v as? [String: Any], let nome = o["nome"] as? String else { continue }
            saida[k] = Autor(nome: nome, quando: o["quando"] as? String, quem: o["quem"] as? String)
        }
        return saida
    }
}

/// Tudo o que o dia tem além das leituras; cada parte pode faltar.
struct ExtrasDoDia {
    var resumo: String?
    var trechos: Trechos?
    var catalogo: CatalogoCards?
    var santo: SantosFrases.Frase?
    /// O santo é a própria celebração do dia (e não um lembrado na data, em dia comum).
    var santoDoDia = false
    var sobre: (slug: String, celebracao: String)?
    var comentario: ComentarioPronto?
}

/// O comentário dos Padres já resolvido: destaques (nome do Padre + texto) e as lectiones inteiras.
struct ComentarioPronto {
    struct Fala: Identifiable { let id = UUID(); let autor: String; let obra: String?; let texto: String; let latim: String? }
    let evangelho: String
    let tema: String?
    let destaques: [Fala]
    let inteiro: [Fala]
    let catecismo: [Comentario.Paragrafo]
    /// "Lucas 15" e o endereço do capítulo em /catena/, se a página existe.
    let capitulo: (nome: String, url: URL)?
}

extension Servidor {
    /// Carrega o que a página do dia mostra além das leituras (liturgiadiaria.js → aplicarDia).
    func extras(_ dia: Dia) async -> ExtrasDoDia {
        let dt = dia.data
        async let resumo = objeto(Resumo.self, "data/liturgia-resumos/\(dt).json")
        async let trechos = objeto(Trechos.self, "data/liturgia-trechos/\(dt).json")
        async let catalogo = objeto(CatalogoCards.self, "data/cards-imagens.json", fixo: true)
        async let frases = objeto(SantosFrases.self, "data/santos-frases.json")
        async let indiceSantos = objeto([String: String].self, "data/santos/indice.json")
        async let comentario = comentarioPronto(dia)
        var e = ExtrasDoDia()
        if let r = await resumo, r.leituras == dia.assinatura { e.resumo = r.texto }
        if let t = await trechos, t.leituras == dia.assinatura { e.trechos = t }
        e.catalogo = await catalogo
        if let f = await frases {
            if let s = f.frases?[dia.celebracao] { e.santo = s; e.santoDoDia = true } else { e.santo = f.porData?[String(dt.suffix(5))] }
        }
        if let slug = await indiceSantos?[dia.celebracao] { e.sobre = (slug, dia.celebracao) }
        e.comentario = await comentario
        return e
    }

    private func comentarioPronto(_ dia: Dia) async -> ComentarioPronto? {
        guard let c = await objeto(Comentario.self, "data/liturgia-comentario/\(dia.data).json"),
              c.leituras == dia.assinatura else { return nil }
        var capitulo: [Lectio] = []
        var linkCap: (String, URL)?
        if let ref = c.catena?.first {
            let chave = "\(ref.ev)/\(String(format: "%02d", ref.cap))"
            capitulo = await objeto([Lectio].self, "data/catena/\(chave).json", fixo: false) ?? []
            let nomes = ["Mt": "Mateus", "Mc": "Marcos", "Lc": "Lucas", "Jo": "João"]
            if let nome = nomes[ref.ev], let pub = await objeto([String].self, "data/catena-publicados.json"),
               pub.contains("\(ref.ev.lowercased())/\(ref.cap)"),
               let url = URL(string: "https://santadoutrina.com/catena/\(ref.ev.lowercased())/\(ref.cap)/") {
                linkCap = ("\(nome) \(ref.cap)", url)
            }
        }
        let autores = await dados("data/catena-autores.json").map(Autores.ler) ?? [:]
        let obras = ["in Matthaeum": "Homilias sobre Mateus", "de Cons. Evang": "Da concordância dos Evangelistas",
                     "in Lucam": "Homilias sobre Lucas", "in Ioannem": "Homilias sobre João"]
        func fala(_ it: Lectio.Item) -> ComentarioPronto.Fala? {
            guard let pt = it.pt, !pt.isEmpty else { return nil }
            let obra = it.obra.flatMap { $0.isEmpty ? nil : (obras[$0] ?? $0) }
            return .init(autor: autores[it.autor]?.nome ?? it.autor, obra: obra, texto: pt, latim: it.latim)
        }
        let porLectio = Dictionary(capitulo.map { ($0.lectio, $0) }, uniquingKeysWith: { a, _ in a })
        let destaques = (c.destaques ?? []).compactMap { d -> ComentarioPronto.Fala? in
            guard let l = porLectio[d.lectio], l.itens.indices.contains(d.i) else { return nil }
            return fala(l.itens[d.i])
        }
        let inteiro = (c.catena ?? []).compactMap { porLectio[$0.lectio] }.flatMap { $0.itens.compactMap(fala) }
        let cic = Array((c.catecismo ?? []).prefix(6))
        if destaques.isEmpty && cic.isEmpty { return nil }
        return ComentarioPronto(evangelho: c.evangelho, tema: c.tema, destaques: destaques, inteiro: inteiro,
                                catecismo: cic, capitulo: linkCap)
    }
}
