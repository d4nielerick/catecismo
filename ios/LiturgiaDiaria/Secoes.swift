import SwiftUI

// As partes da página do dia além das leituras: o nome da celebração com "Saiba mais" e o
// compartilhar do santo, o resumo das leituras, as leituras alternativas ("ou …") e o comentário
// dos Padres (Catena Aurea) com os §§ do Catecismo.

// MARK: Nome do dia

struct NomeDoDia: View {
    let nome: String
    let santo: SantosFrases.Frase?
    let saibaMais: Bool
    var abrirSobre: () -> Void
    var compartilharSanto: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !nome.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    (Text(nome).font(Estilo.leituraItalico(16)).foregroundColor(Estilo.tinta)
                     + (saibaMais ? Text("  SAIBA MAIS").font(Estilo.sans(9, .semibold)).foregroundColor(Estilo.vermelho).kerning(0.72)
                        .baselineOffset(1.5) : Text("")))
                        .lineSpacing(5)
                        .onTapGesture { if saibaMais { abrirSobre() } }
                        .accessibilityAddTraits(saibaMais ? .isButton : [])
                        .accessibilityHint(saibaMais ? "Abre o resumo da Wikipédia sobre a celebração" : "")
                    if santo != nil && (santo?.nome ?? nome) == nome { botao }
                }
            }
            if let s = santo, let n = s.nome, n != nome {
                // santo lembrado na data, em dia comum ou domingo (porData)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(n).font(Estilo.leituraItalico(nome.isEmpty ? 16 : 14)).foregroundStyle(nome.isEmpty ? Estilo.tinta : Estilo.suave)
                    botao
                }
            }
        }
    }

    private var botao: some View {
        Button(action: compartilharSanto) {
            IconeCompartilhar()
                .stroke(style: StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round))
                .foregroundStyle(Estilo.vermelho)
                .frame(width: 17, height: 17)
                .frame(width: 32, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(Afunda())
        .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 9 }
        .accessibilityLabel("Compartilhar uma frase de \(santo?.nome ?? nome)")
    }
}

// MARK: Resumo das leituras (.lp-resumo)

struct ResumoView: View {
    let texto: String
    let hoje: Bool
    let cor: String
    @State private var aberto = UserDefaults.standard.bool(forKey: "abrirResumo")   // depuração

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("RESUMO DAS LEITURAS").font(Estilo.sans(9.5, .semibold)).kerning(0.8).foregroundStyle(Estilo.suave)
                Spacer()
                Text(aberto ? "OCULTAR" : "MOSTRAR").font(Estilo.sans(9.5, .semibold)).kerning(0.8).foregroundStyle(Estilo.tinta)
            }
            .frame(minHeight: 22)
            if aberto {
                Text("\(hoje ? "Hoje" : "Neste dia"), \(texto)")
                    .font(Estilo.leitura(15)).foregroundStyle(Estilo.texto).lineSpacing(15 * 0.6)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .padding(.top, 8)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, aberto ? 17 : 11)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(CorLiturgica.titulo(cor).opacity(0.1)))
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture { withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) { aberto.toggle() } }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(aberto ? "Oculta o resumo" : "Mostra o resumo")
    }
}

// MARK: Leitura alternativa (.leitura-alt)

struct Alternativa: View {
    let leitura: Leitura
    let dia: Dia
    @State private var aberta = UserDefaults.standard.bool(forKey: "abrirAlternativas")   // depuração

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Line().stroke(style: StrokeStyle(lineWidth: 1, dash: [1, 3])).foregroundStyle(Color.black.opacity(0.28))
                .frame(height: 1)
            Button { withAnimation(.easeInOut(duration: 0.3)) { aberta.toggle() } } label: {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                        .rotationEffect(.degrees(aberta ? 90 : 0)).foregroundStyle(Estilo.suave)
                    (Text("ou ").font(Estilo.leituraItalico(15)).foregroundColor(Estilo.vermelho)
                     + Text(leitura.rotulo + (leitura.referencia.isEmpty ? "" : " · \(leitura.referencia)"))
                        .font(Estilo.leitura(14.5)).foregroundColor(Estilo.suave))
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(aberta ? "Recolhe a leitura" : "Mostra esta leitura à escolha")
            if aberta {
                LeituraView(leitura: leitura, dia: dia, audio: nil, soCorpo: true)
                    .padding(.top, 6)
                    .transition(.opacity)
            }
        }
        .padding(.top, 28)
    }
}

struct Line: Shape {
    func path(in r: CGRect) -> Path { Path { $0.move(to: CGPoint(x: 0, y: r.midY)); $0.addLine(to: CGPoint(x: r.maxX, y: r.midY)) } }
}

// MARK: Comentário dos Padres (.lp-comentario)

enum Glosa {
    /// comLema: as palavras do Evangelho entre aspas ficam em itálico (sem as aspas), como na glosa.
    static func texto(_ s: String, tamanho t: CGFloat) -> Text {
        var saida = Text("")
        var resto = Substring(s)
        while let a = resto.firstIndex(of: "\""), let b = resto[resto.index(after: a)...].firstIndex(of: "\""),
              resto.distance(from: a, to: b) > 3 {
            saida = saida + Text(String(resto[..<a])).font(Estilo.leitura(t))
                + Text(String(resto[resto.index(after: a)..<b])).font(Estilo.leituraItalico(t))
            resto = resto[resto.index(after: b)...]
        }
        return saida + Text(String(resto)).font(Estilo.leitura(t))
    }

    /// Nome do Padre em versalete (a 1ª letra de cada palavra grande, o resto em maiúsculas menores).
    static func versalete(_ nome: String, _ t: CGFloat) -> Text {
        var saida = Text("")
        for (i, palavra) in nome.split(separator: " ").enumerated() {
            if i > 0 { saida = saida + Text(" ").font(Estilo.sans(t)) }
            let p = String(palavra)
            let primeira = String(p.prefix(1)), resto = String(p.dropFirst())
            if primeira == primeira.uppercased() && primeira != primeira.lowercased() {
                saida = saida + Text(primeira).font(.custom("InriaSerif-Bold", fixedSize: t))
                    + Text(resto.uppercased()).font(.custom("InriaSerif-Bold", fixedSize: t * 0.78))
            } else {
                saida = saida + Text(p.uppercased()).font(.custom("InriaSerif-Bold", fixedSize: t * 0.78))
            }
        }
        return saida.foregroundColor(Estilo.vermelho).kerning(0.6)
    }
}

struct ComentarioView: View {
    let comentario: ComentarioPronto
    var abrirInteiro: () -> Void
    @Environment(\.openURL) private var abrir

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ornamento.padding(.bottom, 36)
            if !comentario.destaques.isEmpty {
                rotulo("Os Padres sobre o Evangelho")
                (Text("Da ") + Text("Catena Aurea").font(Estilo.leituraItalico(14.7)) + Text(" de São Tomás de Aquino sobre \(comentario.evangelho)"))
                    .font(Estilo.leitura(14.7)).italic().foregroundStyle(Estilo.suave)
                    .padding(.bottom, 4)
                if let tema = comentario.tema {
                    Text(tema).font(Estilo.titulo(21.6)).foregroundStyle(Estilo.tinta).tracking(-0.2)
                        .padding(.bottom, 16)
                }
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(comentario.destaques) { f in
                        (Glosa.versalete(f.autor, 14.5) + Text(". ").font(Estilo.leitura(14.5)) + Glosa.texto(f.texto, tamanho: 14.5))
                            .foregroundStyle(Estilo.texto).lineSpacing(14.5 * 0.5)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    if !comentario.inteiro.isEmpty {
                        Button(action: abrirInteiro) { linkRotulo("Ler o comentário inteiro") }.buttonStyle(.plain)
                    }
                    if let cap = comentario.capitulo {
                        Button { abrir(cap.url) } label: {
                            Text("Ler \(cap.nome) inteiro comentado pelos Padres →")
                                .font(Estilo.sans(11.2, .semibold)).kerning(1.1).foregroundStyle(Estilo.vermelho)
                                .textCase(.uppercase).multilineTextAlignment(.leading)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 6)
            }
            if !comentario.catecismo.isEmpty {
                rotulo("No Catecismo").padding(.top, comentario.destaques.isEmpty ? 0 : 32)
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(comentario.catecismo, id: \.numero) { p in
                        Button {
                            if let u = URL(string: "https://santadoutrina.com/#paragrafo-\(p.numero)") { abrir(u) }
                        } label: {
                            (Text("§ \(p.numero)  ").font(Estilo.sans(12.5, .semibold)).foregroundColor(Estilo.vermelho)
                             + Text(p.frase).font(Estilo.leitura(14.5)).foregroundColor(Estilo.texto))
                                .lineSpacing(14.5 * 0.5).multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Abre o parágrafo no Catecismo")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func rotulo(_ t: String) -> some View {
        Text(t.uppercased()).font(Estilo.sans(10.5, .semibold)).kerning(1.5).foregroundStyle(Estilo.vermelho)
            .padding(.bottom, 8).accessibilityAddTraits(.isHeader)
    }

    private func linkRotulo(_ t: String) -> some View {
        Text(t.uppercased()).font(Estilo.sans(11.2, .semibold)).kerning(1.1).foregroundStyle(Estilo.vermelho)
            .padding(.bottom, 2)
            .overlay(alignment: .bottom) { Rectangle().fill(Estilo.vermelho.opacity(0.35)).frame(height: 1) }
    }

    /// O divisor de antes do comentário (liturgia-divisor.svg): fios finos e a cruz.
    private var ornamento: some View {
        HStack(spacing: 14) {
            Rectangle().fill(Estilo.vermelho.opacity(0.4)).frame(width: 70, height: 1)
            Text("✠").font(.system(size: 22, weight: .bold)).foregroundStyle(Estilo.vermelho)
            Rectangle().fill(Estilo.vermelho.opacity(0.4)).frame(width: 70, height: 1)
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
}

/// O comentário inteiro das perícopes do dia (o modal do site), com o latim recolhido.
struct ComentarioInteiroView: View {
    let comentario: ComentarioPronto
    @Environment(\.dismiss) private var fechar

    var body: some View {
        Folhinha(sobre: "Catena Aurea · os Padres sobre", titulo: comentario.evangelho, fechar: { fechar() }) {
            ForEach(comentario.inteiro) { f in
                VStack(alignment: .leading, spacing: 4) {
                    (Text(f.autor.uppercased()).font(Estilo.sans(11.8, .semibold)).kerning(0.7)
                     + Text(f.obra.map { ", \($0)" } ?? "").font(Estilo.leituraItalico(13)))
                        .foregroundStyle(Estilo.vermelho)
                    Text(f.texto).font(Estilo.leitura(15)).foregroundStyle(Estilo.texto).lineSpacing(15 * 0.6)
                        .fixedSize(horizontal: false, vertical: true)
                    if let la = f.latim, !la.isEmpty { Latim(texto: la) }
                }
                .padding(.bottom, 20)
            }
            Text("Catena Aurea de São Tomás de Aquino (séc. XIII), traduzida do latim a partir do texto do Corpus Thomisticum. Tradução em revisão.")
                .font(Estilo.sans(12)).foregroundStyle(Estilo.suave).padding(.top, 8)
        }
    }
}

struct Latim: View {
    let texto: String
    @State private var aberto = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { withAnimation(.easeInOut(duration: 0.2)) { aberto.toggle() } } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.right").font(.system(size: 8, weight: .bold)).rotationEffect(.degrees(aberto ? 90 : 0))
                    Text("LATIM").font(Estilo.sans(10.5, .semibold)).kerning(1.1)
                }
                .foregroundStyle(Estilo.suave).padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            if aberto {
                Text(texto).font(Estilo.leituraItalico(13.5)).foregroundStyle(Estilo.suave)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: Sobre a celebração (Wikipédia, CC BY-SA 4.0)

struct SobreView: View {
    let slug: String
    let celebracao: String
    @State private var dados: Sobre?
    @State private var falhou = false
    @State private var imagens: [String: UIImage] = [:]
    @Environment(\.dismiss) private var fechar
    @Environment(\.openURL) private var abrir

    var body: some View {
        Folhinha(sobre: "Sobre a celebração", titulo: celebracao, fechar: { fechar() }) {
            if let dados {
                ForEach(Array(dados.artigos.enumerated()), id: \.element.id) { k, a in
                    VStack(alignment: .leading, spacing: 12) {
                        if k > 0 {
                            Line().stroke(style: StrokeStyle(lineWidth: 1, dash: [1, 3])).foregroundStyle(Color.black.opacity(0.28))
                                .frame(height: 1).padding(.bottom, 8)
                        }
                        if let src = a.imagem?.src, let img = imagens[src] {
                            Image(uiImage: img).resizable().scaledToFit()
                                .frame(maxWidth: 150, maxHeight: 210)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                                .frame(maxWidth: .infinity)
                                .accessibilityLabel(a.titulo)
                        }
                        if dados.artigos.count > 1 {
                            Text(a.titulo).font(.custom("InriaSerif-Bold", fixedSize: 17)).foregroundStyle(Estilo.tinta)
                        }
                        ForEach(a.resumo, id: \.self) { p in
                            Text(p).font(Estilo.leitura(15.5)).foregroundStyle(Estilo.texto).lineSpacing(15.5 * 0.6)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Button { if let u = URL(string: a.url) { abrir(u) } } label: {
                            Text("Ler o artigo completo na Wikipédia ↗").font(Estilo.leitura(14)).foregroundStyle(Estilo.vermelho)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.bottom, 20)
                    .task(id: a.imagem?.src) {
                        if let src = a.imagem?.src, imagens[src] == nil, let i = await Servidor.compartilhado.imagem(src) { imagens[src] = i }
                    }
                }
                Text(credito).font(Estilo.sans(12)).foregroundStyle(Estilo.suave).tint(Estilo.suave)
                    .padding(.top, 4)
            } else if falhou {
                Text("Não foi possível carregar agora.").font(Estilo.leituraItalico(15)).foregroundStyle(Estilo.suave)
            } else {
                Text("Carregando…").font(Estilo.leituraItalico(15)).foregroundStyle(Estilo.suave)
            }
        }
        .task {
            dados = await Servidor.compartilhado.objeto(Sobre.self, "data/santos/\(slug).json", fixo: true)
            falhou = dados == nil
        }
    }

    /// "Texto da Wikipédia, a enciclopédia livre, sob a licença CC BY-SA 4.0." com os dois links.
    private var credito: AttributedString {
        var a = AttributedString("Texto da ")
        var w = AttributedString("Wikipédia"); w.link = URL(string: "https://pt.wikipedia.org/"); w.underlineStyle = .single
        var c = AttributedString("CC BY-SA 4.0"); c.link = URL(string: "https://creativecommons.org/licenses/by-sa/4.0/deed.pt_BR"); c.underlineStyle = .single
        a += w; a += AttributedString(", a enciclopédia livre, sob a licença "); a += c; a += AttributedString(".")
        return a
    }
}

/// A folha clara dos modais do site (.lp-modal): rótulo pequeno, título em Times itálico e o corpo.
struct Folhinha<Corpo: View>: View {
    let sobre: String
    let titulo: String
    var fechar: () -> Void
    @ViewBuilder let corpo: () -> Corpo

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(sobre.uppercased()).font(Estilo.sans(10.5, .semibold)).kerning(1.3).foregroundStyle(Estilo.vermelho)
                        Text(titulo).font(Estilo.titulo(30)).foregroundStyle(Estilo.tinta).tracking(-0.4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 12)
                    Button(action: fechar) {
                        Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Estilo.tinta)
                            .frame(width: 36, height: 36).background(Circle().fill(Color(hex: 0x281e0f, alpha: 0.07)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Fechar")
                }
                .padding(.bottom, 20)
                corpo()
            }
            .padding(.horizontal, 26).padding(.top, 28).padding(.bottom, 40)
        }
        .background(Estilo.fundo.ignoresSafeArea())
        .presentationDragIndicator(.visible)
        .preferredColorScheme(.light)
    }
}
