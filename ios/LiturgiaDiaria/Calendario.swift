import SwiftUI

/// O calendário mensal do site (.cal-wrap): mês com setas, iniciais dos dias, hoje em
/// quadrado escuro, dia aberto em cinza claro e pontinhos (dourado = santo, azul = Nossa Senhora).
struct Calendario: View {
    @Binding var selecionado: Date
    let destaques: [String: Indice.Destaque]
    @State private var mes: Date = Date()

    private let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "pt_BR")
        c.firstWeekday = 1
        return c
    }()
    private static let nomeMes: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "pt_BR"); f.dateFormat = "LLLL yyyy"; return f
    }()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Button { trocarMes(-1) } label: { Text("‹").font(.system(size: 22)).frame(width: 30, height: 30) }
                    .accessibilityLabel("Mês anterior")
                Text(Self.nomeMes.string(from: mes).capitalizedFirst)
                    .font(Estilo.sans(15, .semibold)).foregroundStyle(Estilo.tinta).frame(minWidth: 120)
                Button { trocarMes(1) } label: { Text("›").font(.system(size: 22)).frame(width: 30, height: 30) }
                    .accessibilityLabel("Próximo mês")
            }
            .foregroundStyle(Estilo.suave)
            .padding(.bottom, 10)

            let colunas = Array(repeating: GridItem(.flexible(), spacing: 2), count: 7)
            LazyVGrid(columns: colunas, spacing: 2) {
                ForEach(Array(["D", "S", "T", "Q", "Q", "S", "S"].enumerated()), id: \.offset) { _, d in
                    Text(d).font(Estilo.sans(11, .semibold)).foregroundStyle(Estilo.suave).padding(.vertical, 4)
                }
                ForEach(Array(celulas.enumerated()), id: \.offset) { _, d in
                    if let d { celula(d) } else { Color.clear.frame(height: 36) }
                }
            }
        }
        .onAppear { mes = inicioDoMes(selecionado) }
        .onChange(of: selecionado) { _, novo in mes = inicioDoMes(novo) }
    }

    private func celula(_ d: Date) -> some View {
        let hoje = cal.isDateInToday(d)
        let sel = cal.isDate(d, inSameDayAs: selecionado)
        let destaque = destaques[Datas.chave(d)]
        let ponto: Color? = destaque.map { hoje ? .white.opacity(0.85) : ($0.tipo == "santo" ? Color(hex: 0xc9ab6b) : Color(hex: 0x8fa6c4)) }
        return Button { selecionado = d } label: {
            Text("\(cal.component(.day, from: d))")
                .font(Estilo.sans(15.5, hoje || sel ? .semibold : .regular))
                .foregroundStyle(hoje ? Color.white : (sel ? Estilo.tinta : Color(hex: 0x3a3632)))
                .frame(maxWidth: .infinity)
                .padding(.top, 6).padding(.bottom, 12)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(hoje ? Color(hex: 0x26211b) : (sel ? Color.black.opacity(0.08) : .clear))
                        .padding(.horizontal, 4)
                )
                .overlay(alignment: .bottom) {
                    if let ponto { Circle().fill(ponto).frame(width: 4, height: 4).padding(.bottom, 4) }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Datas.longa(d) + (destaque.map { ", " + $0.nome } ?? ""))
    }

    private var celulas: [Date?] {
        let inicio = inicioDoMes(mes)
        let vazios = (cal.component(.weekday, from: inicio) - cal.firstWeekday + 7) % 7
        let n = cal.range(of: .day, in: .month, for: inicio)!.count
        return Array(repeating: nil, count: vazios) + (0..<n).map { cal.date(byAdding: .day, value: $0, to: inicio) }
    }

    private func inicioDoMes(_ d: Date) -> Date { cal.date(from: cal.dateComponents([.year, .month], from: d))! }
    private func trocarMes(_ n: Int) { mes = cal.date(byAdding: .month, value: n, to: mes)! }
}
