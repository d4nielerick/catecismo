import AVFoundation
import MediaPlayer
import SwiftUI
import UIKit

/// data/liturgia-audio/AAAA-MM-DD/<leitura>.json: o tempo de cada linha da voz.
struct AudioLeitura: Codable, Equatable {
    struct Linha: Codable, Equatable { let t0: Double; let t1: Double; let texto: String }
    let referencia: String
    let duracao: Double
    let linhas: [Linha]
}

/// Uma leitura do dia com voz, na ordem da missa (LEITURAS_COM_VOZ do site).
struct ItemFila: Equatable {
    let nome: String     // primeira-leitura | salmo | segunda-leitura | evangelho
    let rotulo: String   // 1ª Leitura | Salmo | 2ª Leitura | Evangelho

    static let ordem: [(String, String)] = [
        ("primeira-leitura", "1ª Leitura"), ("salmo", "Salmo"), ("segunda-leitura", "2ª Leitura"), ("evangelho", "Evangelho"),
    ]
    static func fila(_ nomes: Set<String>) -> [ItemFila] {
        ordem.filter { nomes.contains($0.0) }.map { ItemFila(nome: $0.0, rotulo: $0.1) }
    }
    /// "o Salmo", "a 2ª Leitura"
    var comArtigo: String { (rotulo == "Salmo" || rotulo == "Evangelho" ? "o " : "a ") + rotulo }
}

/// O aviso do fim de cada leitura (terminou() em leitor-audio.mjs).
struct AvisoFim: Equatable {
    var texto: String
    var botoes: [(acao: String, rotulo: String)]
    static func == (a: AvisoFim, b: AvisoFim) -> Bool { a.texto == b.texto && a.botoes.map(\.acao) == b.botoes.map(\.acao) }
}

/// O leitor de áudio do site (liturgiadiaria/leitor-audio.mjs): a fila das leituras do dia, a voz,
/// a música de fundo bem baixa, a linha que está sendo lida e a tela de bloqueio.
@MainActor
final class Player: ObservableObject {
    static let volumeMusica: Float = 0.07   // bem por baixo da voz
    static let urlMusica = Servidor.base.appendingPathComponent("assets/audio/fundo-leitura.mp3")

    @Published var aberto = false
    @Published private(set) var fila: [ItemFila] = []
    @Published private(set) var pos = 0
    @Published private(set) var dados: AudioLeitura?
    @Published private(set) var atual = -1                 // linha sendo lida
    @Published private(set) var tocando = false
    @Published private(set) var esperando = false          // a voz carregando ou travada esperando rede
    @Published private(set) var aviso: AvisoFim?
    @Published private(set) var musicaLigada = UserDefaults.standard.object(forKey: "lp-ouvir-musica") as? Bool ?? true
    @Published private(set) var cor = Color(hex: 0x3a2a1a)
    /// Muda a cada leitura carregada: a tela volta o texto ao começo.
    @Published private(set) var geracao = 0

    private(set) var dia = ""
    private var inicioFila = 0
    private var seguirSozinho = true
    private var voz: AVPlayer?
    private var musica: AVQueuePlayer?
    private var laco: AVPlayerLooper?
    private var observadorTempo: Any?
    private var observadores: [NSKeyValueObservation] = []
    private var fim: NSObjectProtocol?
    private var contagem: Timer?
    private var fadeMusica: Timer?
    private var capa: MPMediaItemArtwork?
    private var pulouDepuracao = false

    init() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.tocar(); return .success }
        c.pauseCommand.addTarget { [weak self] _ in self?.pausar(); return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in self?.alternar(); return .success }
        c.skipBackwardCommand.preferredIntervals = [15]
        c.skipForwardCommand.preferredIntervals = [15]
        c.skipBackwardCommand.addTarget { [weak self] _ in self?.pular(-15); return .success }
        c.skipForwardCommand.addTarget { [weak self] _ in self?.pular(15); return .success }
        c.changePlaybackPositionCommand.addTarget { [weak self] e in
            guard let e = e as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.ir(para: e.positionTime); return .success
        }
        c.nextTrackCommand.addTarget { [weak self] _ in
            guard let self, self.pos + 1 < self.fila.count else { return .noSuchContent }
            self.seguirSozinho = true; self.carregar(self.pos + 1); return .success
        }
        c.previousTrackCommand.addTarget { [weak self] _ in
            guard let self, self.pos > 0 else { return .noSuchContent }
            self.carregar(self.pos - 1); return .success
        }
    }

    var item: ItemFila? { fila.indices.contains(pos) ? fila[pos] : nil }
    var proxima: ItemFila? { fila.indices.contains(pos + 1) ? fila[pos + 1] : nil }
    var duracao: Double {
        if let d = voz?.currentItem?.duration.seconds, d.isFinite, d > 0 { return d }
        return dados?.duracao ?? 1
    }
    var tempo: Double { voz?.currentTime().seconds ?? 0 }

    // MARK: Abrir e fechar

    /// ouvir() do site: `inicio` é a leitura tocada; quem começa do início segue sozinho para as próximas.
    func ouvir(dia: String, cor: String, fila: [ItemFila], inicio: Int) {
        guard fila.indices.contains(inicio) else { return }
        self.dia = dia
        self.fila = fila
        self.cor = CorLiturgica.calendario(cor)
        inicioFila = inicio
        seguirSozinho = inicio == 0
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        aberto = true
        carregar(inicio)
        if capa == nil {
            Task {
                if let img = await Servidor.compartilhado.imagem("assets/img/liturgia-icone-512.png") {
                    capa = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
                    infoTelaDeBloqueio()
                }
            }
        }
    }

    /// Fechar a tela (ou trocar de dia): para a voz e a música.
    func parar() {
        fecharAviso()
        voz?.pause()
        if let observadorTempo { voz?.removeTimeObserver(observadorTempo) }
        observadorTempo = nil
        observadores = []
        if let fim { NotificationCenter.default.removeObserver(fim) }
        fim = nil
        voz = nil
        fadeMusica?.invalidate()
        musica?.pause()
        musica?.seek(to: .zero)
        tocando = false
        esperando = false
        aberto = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // MARK: Uma leitura da fila

    func carregar(_ k: Int) {
        guard fila.indices.contains(k) else { return }
        fecharAviso()
        pos = k
        esperando = true
        let alvoDia = dia, nome = fila[k].nome
        Task {
            let d = await Servidor.compartilhado.objeto(AudioLeitura.self, "data/liturgia-audio/\(alvoDia)/\(nome).json", fixo: true)
            guard alvoDia == dia, pos == k, aberto else { return }
            dados = d
            atual = -1
            geracao += 1
            prepararVoz(Servidor.urlAudio(dia: alvoDia, nome: nome))
            tocar()
            // Depuração: `-ouvirEm 40` começa a primeira leitura aberta nesse segundo
            let em = UserDefaults.standard.double(forKey: "ouvirEm")
            if em > 0, !pulouDepuracao { pulouDepuracao = true; ir(para: em) }
        }
    }

    /// Um tocador por leitura; o fim chama terminou().
    private func prepararVoz(_ url: URL) {
        voz?.pause()
        if let observadorTempo { voz?.removeTimeObserver(observadorTempo) }
        if let fim { NotificationCenter.default.removeObserver(fim) }
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        p.automaticallyWaitsToMinimizeStalling = true
        voz = p
        observadorTempo = p.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 20), queue: .main) { [weak self] t in
            MainActor.assumeIsolated { self?.acompanhar(t.seconds) }
        }
        observadores = [
            p.observe(\.timeControlStatus, options: [.new]) { [weak self] p, _ in
                let s = p.timeControlStatus
                Task { @MainActor in self?.esperando = s == .waitingToPlayAtSpecifiedRate }
            },
            item.observe(\.status, options: [.new]) { [weak self] i, _ in
                let pronto = i.status != .unknown
                Task { @MainActor in if pronto { self?.esperando = false; self?.infoTelaDeBloqueio() } }
            },
        ]
        fim = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.terminou() }
        }
    }

    /// A linha que está sendo lida (acompanhar() do site).
    private func acompanhar(_ t: Double) {
        // no começo e ao buscar, o AVPlayer às vezes informa um tempo inválido (NaN): sem isso a
        // linha "atual" virava a última por um instante e o texto saltava para o fim
        guard t.isFinite, t >= 0, let ls = dados?.linhas, !ls.isEmpty else { return }
        var i = ls.firstIndex { t < $0.t1 + 0.15 } ?? ls.count - 1
        if t < ls[0].t0 { i = 0 }
        if i != atual { atual = i }
    }

    // MARK: Controles

    func tocar() {
        guard let voz else { return }
        fecharAviso()
        if voz.currentItem.map({ $0.currentTime() >= $0.duration && $0.duration.isNumeric }) == true { voz.seek(to: .zero) }
        voz.play()
        tocando = true
        if musicaLigada { ligarMusica(1.5) }
        infoTelaDeBloqueio()
    }

    func pausar() {
        voz?.pause()
        tocando = false
        if let m = musica, m.rate > 0 { fade(para: 0, em: 0.6) { m.pause() } }
        infoTelaDeBloqueio()
    }

    func alternar() { tocando ? pausar() : tocar() }

    func pular(_ s: Double) { ir(para: max(0, min(duracao, tempo + s))) }

    func ir(para t: Double) {
        guard let voz else { return }
        voz.seek(to: CMTime(seconds: t, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in self?.infoTelaDeBloqueio() }
        }
        acompanhar(t)
    }

    /// Tocar numa linha pula a voz para ela.
    func ir(linha i: Int) {
        guard let l = dados?.linhas[safe: i] else { return }
        ir(para: l.t0 + 0.01)
        if !tocando { tocar() }
    }

    func alternarMusica() {
        musicaLigada.toggle()
        UserDefaults.standard.set(musicaLigada, forKey: "lp-ouvir-musica")
        if musicaLigada && tocando { ligarMusica(0.8) }
        else if let m = musica, m.rate > 0 { fade(para: 0, em: 0.5) { m.pause() } }
    }

    // MARK: Música de fundo (entra e sai em fade)

    private func ligarMusica(_ duracaoFade: Double) {
        if musica == nil {
            let q = AVQueuePlayer()
            laco = AVPlayerLooper(player: q, templateItem: AVPlayerItem(url: Self.urlMusica))
            q.volume = 0
            musica = q
        }
        musica?.play()
        fade(para: Self.volumeMusica, em: duracaoFade)
    }

    private func fade(para alvo: Float, em s: Double, depois: (() -> Void)? = nil) {
        guard let m = musica else { depois?(); return }
        fadeMusica?.invalidate()
        let de = m.volume, t0 = Date()
        fadeMusica = Timer.scheduledTimer(withTimeInterval: 1 / 30, repeats: true) { [weak self] t in
            MainActor.assumeIsolated {
                let p = Float(min(1, Date().timeIntervalSince(t0) / s))
                m.volume = max(0, min(1, de + (alvo - de) * p))
                if p >= 1 { t.invalidate(); if self?.fadeMusica === t { self?.fadeMusica = nil }; depois?() }
            }
        }
    }

    // MARK: Fim de cada leitura
    // Começou do início: aviso "A seguir: Salmo, em 3" e segue sozinho (dá para começar já ou parar).
    // Começou por uma do meio: pergunta se continua, ouve de novo ou sai. Na última: de novo ou sair.

    private func terminou() {
        tocando = false
        infoTelaDeBloqueio()
        guard let proxima else {
            aviso = AvisoFim(texto: "Fim das leituras.", botoes: [("novamente", "Ouvir novamente"), ("sair", "Sair")])
            return
        }
        if !seguirSozinho {
            aviso = AvisoFim(texto: "Continuar com \(proxima.comArtigo)?",
                             botoes: [("continuar", "Continuar ouvindo"), ("novamente", "Ouvir novamente"), ("sair", "Sair")])
            return
        }
        // com a tela apagada ninguém vê a contagem: segue direto, sem deixar o áudio parar
        if UIApplication.shared.applicationState != .active { escolher("continuar"); return }
        var n = 3
        aviso = AvisoFim(texto: "A seguir: \(proxima.rotulo), em \(n)", botoes: [("continuar", "Começar já"), ("parar", "Parar")])
        contagem?.invalidate()
        contagem = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                n -= 1
                if n <= 0 { self.escolher("continuar"); return }
                self.aviso?.texto = "A seguir: \(proxima.rotulo), em \(n)"
            }
        }
    }

    func escolher(_ acao: String) {
        fecharAviso()
        switch acao {
        case "sair": parar()
        case "parar":
            pausar()
            if let m = musica { fade(para: 0, em: 0.8) { m.pause() } }
        case "continuar":
            seguirSozinho = true
            carregar(pos + 1)
        case "novamente":
            // na última, volta ao começo do que a pessoa ouviu; no meio, repete a que acabou
            carregar(proxima != nil ? pos : inicioFila)
        default: break
        }
    }

    /// "Pular para o Salmo ›", quando a pessoa rola o texto até o fim.
    func pularParaProxima() {
        guard proxima != nil else { return }
        seguirSozinho = true
        carregar(pos + 1)
    }

    private func fecharAviso() {
        contagem?.invalidate()
        contagem = nil
        aviso = nil
    }

    // MARK: Tela de bloqueio

    private func infoTelaDeBloqueio() {
        guard aberto, let item else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: "\(item.rotulo) — \(dados?.referencia ?? "")",
            MPMediaItemPropertyArtist: "Liturgia Diária",
            MPMediaItemPropertyPlaybackDuration: duracao,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: tempo,
            MPNowPlayingInfoPropertyPlaybackRate: tocando ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyPlaybackQueueIndex: pos,
            MPNowPlayingInfoPropertyPlaybackQueueCount: fila.count,
        ]
        if let capa { info[MPMediaItemPropertyArtwork] = capa }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        let c = MPRemoteCommandCenter.shared()
        c.nextTrackCommand.isEnabled = proxima != nil
        c.previousTrackCommand.isEnabled = pos > 0
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
