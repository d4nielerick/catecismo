import SwiftUI

/// Uma leitura no desenho do site (.leitura-card): rótulo grande em Times itálico, referência,
/// título em itálico, e o texto em Inria Serif com capitular e versículos vermelhos.
struct LeituraView: View {
    let leitura: Leitura
    let dia: Dia
    let audio: String?          // nome do mp3, se existe voz
    /// Abre a janela de compartilhar (só nas leituras, salmo e evangelho que não são alternativa).
    var compartilhar: (() -> Void)? = nil
    /// Só o título e o texto (a leitura alternativa, aberta dentro do "ou …").
    var soCorpo = false
    /// Abre a tela de ouvir nesta leitura (só quando há voz).
    var ouvir: (() -> Void)? = nil
    @AppStorage(TamanhoTexto.chave) private var escala = TamanhoTexto.padrao
    /// Corpo da leitura: 16pt (como no site) vezes o "Tamanho do texto" do menu.
    private var corpoT: CGFloat { 16 * TamanhoTexto.escala(escala) }
    private var menor: Bool { leitura.tipo == "aclamacao" || leitura.tipo == "sequencia" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !soCorpo { cabeca }
            if let t = leitura.titulo, !t.isEmpty {
                Text(t).font(Estilo.leituraItalico(corpoT)).foregroundStyle(Estilo.tinta)
                    .padding(.bottom, 11).padding(.top, soCorpo ? 0 : 8)
            }
            corpo.padding(.top, soCorpo ? 4 : 14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var cabeca: some View {
            HStack(alignment: .center, spacing: 4) {
                rotulo
                Spacer(minLength: 8)
                if audio != nil, let ouvir {
                    Button(action: ouvir) {
                        Image(systemName: "headphones")
                            .font(.system(size: 21, weight: .regular))
                            .foregroundStyle(Color(hex: 0x8c867e))
                            .frame(width: 36, height: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(Afunda())
                    .accessibilityLabel("Ouvir: \(leitura.rotulo)")
                }
                if let compartilhar {
                    Button(action: compartilhar) {
                        IconeCompartilhar()
                            .stroke(style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                            .foregroundStyle(Color(hex: 0x8c867e))
                            .frame(width: 22, height: 22)
                            .frame(width: 40, height: 40)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(Afunda())
                    .accessibilityLabel("Compartilhar: \(leitura.rotulo)")
                }
            }
            if !leitura.referencia.isEmpty {
                Text(leitura.referencia).font(Estilo.leitura(corpoT)).foregroundStyle(Estilo.tinta)
                    .padding(.bottom, 11)
            }
    }

    /// "1ª Leitura": o "ª" fica elevado como no site.
    private var rotulo: some View {
        let t: CGFloat = menor ? 30 : 41.25
        var a = AttributedString(leitura.rotulo)
        a.font = Estilo.titulo(t)
        if let r = a.range(of: "ª") ?? a.range(of: "º") {
            a[r].font = Estilo.titulo(t * 0.6)
            a[r].baselineOffset = t * 0.33
        }
        return Text(a).foregroundStyle(Estilo.tinta).tracking(-t * 0.03)
            .lineLimit(2).minimumScaleFactor(0.6)
    }

    @ViewBuilder private var corpo: some View {
        switch leitura.tipo {
        case "salmo": salmo
        case "aclamacao": aclamacao
        case "sequencia":
            Text(leitura.texto).font(Estilo.leitura(corpoT)).foregroundStyle(Estilo.texto).lineSpacing(corpoT * 0.45)
        default: ProsaCapitular(texto: leitura.texto, tamanho: corpoT)
        }
    }

    private func estiloParagrafo(_ t: Text) -> some View {
        t.font(Estilo.leitura(corpoT)).foregroundStyle(Estilo.texto).lineSpacing(corpoT * 0.45)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func versiculo(_ v: String) -> Text {
        Text(v + "\u{2009}").font(Estilo.leitura(corpoT * 0.66)).foregroundColor(Estilo.vermelho).baselineOffset(corpoT * 0.36)
    }

    private func rotuloR(_ r: String) -> Text { Text(r + " ").foregroundColor(Estilo.tinta) }

    /// renderSalmo: refrão ("R." preto + texto corrido) e as estrofes em parágrafos corridos.
    private var salmo: some View {
        let linhas = leitura.texto.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        var i = 0
        var refrao: [String] = []
        if let p = linhas.first, p == "R." || p == "R" || p.hasPrefix("R. ") {
            let resto = p.hasPrefix("R. ") ? String(p.dropFirst(3)) : ""
            if !resto.isEmpty { refrao.append(resto) }
            i = 1
            while i < linhas.count {
                let l = linhas[i]
                if Texto.ehVerso(l) || l.contains("*") { break }
                if l != "R." && l != "R" { refrao.append(l) }
                i += 1
            }
        }
        var estrofes: [Text] = []
        var atual: Text? = nil
        let fechar = { if let a = atual { estrofes.append(a) }; atual = nil }
        while i < linhas.count {
            let l = linhas[i].replacingOccurrences(of: "*", with: "").replacingOccurrences(of: "†", with: "").trimmingCharacters(in: .whitespaces)
            i += 1
            if l.isEmpty { continue }
            if l == "R." || l == "R" || l.hasPrefix("R. ") { fechar(); continue }
            let pedaco = Texto.ehVerso(l) ? versiculo(l) : Text(l + " ")
            atual = atual.map { $0 + pedaco } ?? pedaco
        }
        fechar()
        return VStack(alignment: .leading, spacing: 24) {
            if !refrao.isEmpty { estiloParagrafo(rotuloR("R.") + Text(refrao.joined(separator: " "))) }
            ForEach(Array(estrofes.enumerated()), id: \.offset) { _, t in estiloParagrafo(t) }
        }
    }

    /// renderAclamacao: blocos "R." e "V." com quebra de linha.
    private var aclamacao: some View {
        var blocos: [(String?, [String])] = []
        for l in leitura.texto.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }) where !l.isEmpty {
            if l.hasPrefix("R.") || l.hasPrefix("V.") {
                let resto = l.dropFirst(2).trimmingCharacters(in: .whitespaces)
                blocos.append((String(l.prefix(2)), resto.isEmpty ? [] : [resto]))
            } else if blocos.isEmpty {
                blocos.append((nil, [l]))
            } else {
                blocos[blocos.count - 1].1.append(l)
            }
        }
        return VStack(alignment: .leading, spacing: 24) {
            ForEach(Array(blocos.enumerated()), id: \.offset) { _, b in
                estiloParagrafo((b.0.map { rotuloR($0) } ?? Text("")) + Text(b.1.joined(separator: "\n")))
            }
        }
    }
}

/// Divisor entre as leituras: fio, cruz vermelha, fio.
struct Divisor: View {
    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Estilo.linha).frame(height: 1)
            Text("✠").font(.system(size: 30, weight: .bold)).foregroundStyle(Estilo.vermelho).padding(.vertical, 22)
            Rectangle().fill(Estilo.linha).frame(height: 1)
        }
        .padding(.vertical, 40)
    }
}
