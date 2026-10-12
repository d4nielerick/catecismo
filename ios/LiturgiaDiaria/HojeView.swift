import SwiftUI

struct HojeView: View {
    @State private var data = Date()
    @State private var dia: Dia?
    @State private var erro = false
    @State private var audios: Set<String> = []
    @State private var escolhendoData = false
    @State private var avisos = Avisos.ligados()
    @StateObject private var player = Player()

    private var chave: String { Datas.chave(data) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    cabecalho
                    if let dia {
                        ForEach(dia.leituras) { l in
                            let nome = l.nomeAudio(entre: dia.leituras)
                            LeituraView(leitura: l, dia: dia, audio: nome.flatMap { audios.contains($0) ? $0 : nil })
                        }
                    } else if erro {
                        ContentUnavailableView("Sem conexão", systemImage: "wifi.slash",
                            description: Text("Não foi possível carregar as leituras deste dia."))
                        Button("Tentar de novo") { Task { await carregar() } }
                    } else {
                        ProgressView().padding(.top, 60)
                    }
                }
                .padding(16)
            }
            .background((dia.map { CorLiturgica.fundo($0.cor) } ?? Color(hex: 0xfaf7ee)).ignoresSafeArea())
            .navigationTitle("Liturgia Diária")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { mover(-1) } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Dia anterior")
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { avisos ? desligarAvisos() : Task { avisos = await Avisos.ligar() } } label: {
                        Image(systemName: avisos ? "bell.fill" : "bell")
                    }.accessibilityLabel(avisos ? "Desligar aviso das 6h" : "Ligar aviso das 6h")
                    Button { escolhendoData = true } label: { Image(systemName: "calendar") }.accessibilityLabel("Escolher dia")
                    Button { mover(1) } label: { Image(systemName: "chevron.right") }.accessibilityLabel("Próximo dia")
                }
            }
            .sheet(isPresented: $escolhendoData) {
                NavigationStack {
                    DatePicker("Dia", selection: $data, displayedComponents: .date)
                        .datePickerStyle(.graphical).environment(\.locale, Locale(identifier: "pt_BR")).padding()
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { escolhendoData = false } } }
                }
                .presentationDetents([.medium])
            }
        }
        .environmentObject(player)
        .task(id: chave) { await carregar() }
        .task { await Avisos.reagendar() }
    }

    private var cabecalho: some View {
        VStack(spacing: 6) {
            Text(Datas.longa(data)).font(.system(.title2, design: .serif)).italic()
            if let dia {
                HStack(spacing: 8) {
                    Circle().fill(CorLiturgica.ponto(dia.cor)).frame(width: 10, height: 10)
                    Text(dia.celebracao).font(.subheadline.weight(.medium)).multilineTextAlignment(.center)
                }
                Text(dia.tempo).font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 8)
    }

    private func mover(_ n: Int) {
        player.parar()
        if let d = Calendar.current.date(byAdding: .day, value: n, to: data) { data = d }
    }

    private func desligarAvisos() { Avisos.desligar(); avisos = false }

    private func carregar() async {
        dia = nil; erro = false; audios = []
        let alvo = chave
        do {
            let d = try await Servidor.compartilhado.dia(alvo)
            guard alvo == chave else { return }
            dia = d
            for nome in ["primeira-leitura", "salmo", "segunda-leitura", "evangelho"] {
                if await Servidor.compartilhado.temAudio(dia: alvo, nome: nome), alvo == chave { audios.insert(nome) }
            }
        } catch { if alvo == chave { erro = true } }
    }
}
