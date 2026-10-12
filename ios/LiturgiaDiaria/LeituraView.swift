import SwiftUI

/// Uma leitura, no desenho do site: rótulo, referência e o texto com os versículos pequenos.
struct LeituraView: View {
    let leitura: Leitura
    let dia: Dia
    let audio: String?          // nome do mp3, se existe voz
    @EnvironmentObject var player: Player

    private var tocando: Bool { player.tocando == leitura.id }
    private var destaque: Color { CorLiturgica.ponto(dia.cor) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(leitura.rotulo.uppercased())
                        .font(.caption.weight(.semibold)).tracking(1.4).foregroundStyle(destaque)
                    if !leitura.referencia.isEmpty {
                        Text(leitura.referencia).font(.system(.subheadline, design: .serif)).italic().foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if let audio {
                    Button {
                        player.alternar(id: leitura.id, url: Servidor.urlAudio(dia: dia.data, nome: audio),
                                        titulo: "\(leitura.rotulo) · \(leitura.referencia)", subtitulo: dia.celebracao)
                    } label: {
                        Image(systemName: tocando ? "pause.circle.fill" : "play.circle.fill").font(.system(size: 34))
                    }
                    .tint(destaque)
                    .accessibilityLabel(tocando ? "Pausar" : "Ouvir \(leitura.rotulo)")
                }
            }
            corpo
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }

    @ViewBuilder private var corpo: some View {
        if leitura.tipo == "salmo" || leitura.tipo == "sequencia" || leitura.tipo == "aclamacao" {
            poema
        } else {
            Text(prosa).font(.system(.body, design: .serif)).lineSpacing(6)
        }
    }

    /// Prosa: as linhas viram um parágrafo corrido; o número do versículo fica pequeno e elevado.
    private var prosa: AttributedString {
        var out = AttributedString()
        for t in Texto.trechos(leitura.texto) {
            switch t {
            case .verso(let v):
                var a = AttributedString(v + "\u{2009}")
                a.font = .system(.caption2, design: .rounded).weight(.semibold)
                a.baselineOffset = 6
                a.foregroundColor = destaque
                out += a
            case .refrao(let s), .linha(let s):
                out += AttributedString(s + " ")
            }
        }
        return out
    }

    /// Salmo e aclamação: um verso por linha; o refrão em destaque.
    private var poema: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(Texto.trechos(leitura.texto).enumerated()), id: \.offset) { _, t in
                switch t {
                case .verso(let v):
                    Text(v).font(.caption2.weight(.semibold)).foregroundStyle(destaque).padding(.top, 6)
                case .refrao(let s):
                    Text(s).font(.system(.body, design: .serif)).fontWeight(.semibold)
                case .linha(let s):
                    Text(s).font(.system(.body, design: .serif))
                }
            }
        }
    }
}
