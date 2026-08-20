/** Radar Room replay layer: exact LOS and functional geometry are intentionally separate. */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Eye, EyeOff, Pause, Play, RotateCcw, ScanLine, SkipBack, SkipForward } from "lucide-react";
import { functionalRecordsAtTick, type ApproximateSpatialRecord } from "@/lib/approximateSpatial";
import { replaySourceUrl } from "@/lib/replaySource";

type ReplayPlayer = {
  steam_id: number;
  name: string;
  team: string;
  x: number;
  y: number;
  z: number;
  health: number;
  alive: boolean;
  yaw: number;
  duck_amount?: number | null;
};
type ReplayFrame = { tick: number; round: number; players: ReplayPlayer[]; visible_pairs: { observer: number; target: number }[] };
type ReplayData = {
  version: string;
  map: string;
  tick_rate: number;
  replay_mode?: string;
  functional_only?: boolean;
  frames: ReplayFrame[];
  approximate_spatial?: ApproximateSpatialRecord[];
};

export default function ReplayViewer({ apiUrl, reportId, onClose }: { apiUrl: string; reportId: string | null; onClose: () => void }) {
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibility, setVisibility] = useState(true);
  const [functionalGeometry, setFunctionalGeometry] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("all");
  const [status, setStatus] = useState<"idle" | "loading" | "missing">("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setFrameIndex(0);
    setSelectedPlayerId("all");
    fetch(replaySourceUrl(apiUrl, reportId))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("replay missing"))))
      .then((data: ReplayData) => {
        if (!cancelled) {
          setReplay(data);
          setStatus("idle");
        }
      })
      .catch(() => !cancelled && setStatus("missing"));
    return () => {
      cancelled = true;
    };
  }, [apiUrl, reportId]);

  useEffect(() => {
    if (!isPlaying || !replay) return;
    const timer = window.setInterval(
      () => setFrameIndex((index) => (index >= replay.frames.length - 1 ? 0 : index + 1)),
      180,
    );
    return () => window.clearInterval(timer);
  }, [isPlaying, replay]);

  const frame = replay?.frames[frameIndex];
  const bounds = useMemo(() => {
    const players = replay?.frames.flatMap((item) => item.players) ?? [];
    const xs = players.map((player) => player.x);
    const ys = players.map((player) => player.y);
    return { minX: Math.min(...xs, 0), maxX: Math.max(...xs, 1), minY: Math.min(...ys, 0), maxY: Math.max(...ys, 1) };
  }, [replay]);
  const point = (x: number, y: number) => ({
    x: 8 + ((x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1)) * 84,
    y: 90 - ((y - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 1)) * 80,
  });
  const activePlayers = useMemo(
    () => frame?.players.filter((player) => selectedPlayerId === "all" || player.steam_id === Number(selectedPlayerId)) ?? [],
    [frame, selectedPlayerId],
  );
  const playerById = useMemo(() => new Map(frame?.players.map((player) => [player.steam_id, player])), [frame]);
  const approximateRecords = useMemo(
    () => functionalRecordsAtTick(replay?.approximate_spatial ?? [], frame?.tick ?? -1).filter((record) => selectedPlayerId === "all" || record.player_id === Number(selectedPlayerId)),
    [frame?.tick, replay?.approximate_spatial, selectedPlayerId],
  );
  const selectedPlayer = activePlayers[0];
  const crouchedPlayers = activePlayers.filter((player) => (player.duck_amount ?? 0) >= 0.5).length;
  const sourceLabel = reportId ? `API REPLAY / ${reportId}` : "DEMO 3 / FUNCTIONAL";

  return <section className="replay-viewer" aria-label="Interactive Replay Viewer">
    <header className="replay-header">
      <div>
        <button type="button" className="back-action" onClick={onClose}><ChevronLeft size={16} /> К обзору</button>
        <p className="eyebrow amber">ИНТЕРАКТИВНЫЙ ПОВТОР</p>
        <h2>{replay ? replay.map.replace("de_", "").toUpperCase() : "Кадры повтора"}</h2>
      </div>
      <div className="replay-meta"><span>{sourceLabel}</span><span>{replay?.functional_only ? "FUNCTIONAL ONLY" : `VIS / ${visibility ? "ON" : "OFF"}`}</span></div>
    </header>
    {frame && replay ? <>
      <div className="replay-map" style={{ backgroundImage: "linear-gradient(rgba(8,22,21,.74), rgba(8,22,21,.89)), url('/manus-storage/sentinel-route-map_6c357b2d.jpg')" }}>
        <div className="map-stamp">ROUND / {String(frame.round).padStart(2, "0")}<br />TICK / {frame.tick}<br />RATE / {replay.tick_rate}</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`visibility-layer ${visibility ? "shown" : ""}`}>
          {visibility && frame.visible_pairs.map((pair) => {
            const observer = playerById.get(pair.observer);
            const target = playerById.get(pair.target);
            if (!observer || !target || (selectedPlayerId !== "all" && observer.steam_id !== Number(selectedPlayerId) && target.steam_id !== Number(selectedPlayerId))) return null;
            const from = point(observer.x, observer.y);
            const to = point(target.x, target.y);
            return <line key={`${pair.observer}-${pair.target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          })}
        </svg>
        {functionalGeometry ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="approximate-capsule-layer" aria-label="Functional approximate hitbox geometry">
          {approximateRecords.flatMap((record) => record.hitboxes.capsules.map((capsule) => {
            const start = point(capsule.start.x, capsule.start.y);
            const end = point(capsule.end.x, capsule.end.y);
            return <line key={`${record.player_id}-${capsule.name}-${capsule.group_id}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
          }))}
        </svg> : null}
        {activePlayers.map((player) => {
          const position = point(player.x, player.y);
          return <div className={`replay-player ${player.team === "Terrorist" ? "t-side" : "ct-side"} ${!player.alive ? "eliminated" : ""}`} key={player.steam_id} style={{ left: `${position.x}%`, top: `${position.y}%` }}><i style={{ transform: `rotate(${player.yaw}deg)` }} /><span>{player.name}</span><small>{player.health}</small></div>;
        })}
        <div className="map-legend"><span className="legend-ct" /> CT <span className="legend-t" /> T <span className="legend-los" /> LOS {functionalGeometry ? <><span className="legend-approx" /> APPROX</> : null}</div>
      </div>
      <div className="replay-controls">
        <button type="button" aria-label="К первому кадру" onClick={() => setFrameIndex(0)}><SkipBack size={17} /></button>
        <button type="button" aria-label="Предыдущий кадр" onClick={() => setFrameIndex((index) => Math.max(0, index - 1))}><ChevronLeft size={17} /></button>
        <button type="button" className="play-control" aria-label={isPlaying ? "Пауза" : "Воспроизвести"} onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
        <button type="button" aria-label="Следующий кадр" onClick={() => setFrameIndex((index) => Math.min(replay.frames.length - 1, index + 1))}><SkipForward size={17} /></button>
        <button type="button" aria-label="Сбросить повтор" onClick={() => { setFrameIndex(0); setIsPlaying(false); }}><RotateCcw size={16} /></button>
        <input aria-label="Позиция повтора" type="range" min="0" max={Math.max(replay.frames.length - 1, 0)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} />
        <output>{frameIndex + 1} / {replay.frames.length}</output>
        <select aria-label="Фильтр игрока" value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)}><option value="all">Все игроки</option>{frame.players.map((player) => <option value={player.steam_id} key={player.steam_id}>{player.name}</option>)}</select>
        <button type="button" className={`visibility-toggle ${visibility ? "on" : ""}`} onClick={() => setVisibility((value) => !value)}>{visibility ? <Eye size={16} /> : <EyeOff size={16} />} Visibility</button>
        <button type="button" className={`functional-toggle ${functionalGeometry ? "on" : ""}`} disabled={!approximateRecords.length} onClick={() => setFunctionalGeometry((value) => !value)}><ScanLine size={16} /> Functional</button>
      </div>
      <div className="replay-inspector"><div><span>КАДР</span><strong>{frame.players.filter((player) => player.alive).length} игроков в живом состоянии</strong></div><div><span>ЛИНИИ ВИДИМОСТИ</span><strong>{frame.visible_pairs.length} подтверждённых пар</strong></div><div><span>ИСТОЧНИК</span><strong>Visibility Engine · карта + FOV + дым</strong></div></div>
      <aside className="functional-geometry-note"><div><span>FUNCTIONAL GEOMETRY</span><strong>{approximateRecords.length ? `${approximateRecords.length} player records · 19 capsules` : "Нет approximate records"}</strong><small>source / generic_fallback · confidence / approximate · evidence_allowed / false</small></div><div><span>CROUCH</span><strong>{crouchedPlayers} observed players</strong><small>duck_amount меняет только functional profile</small></div><p>Эта визуализация не является evidence, не влияет на LOS, hitbox crossing, penetration или verdict.</p></aside>
      <aside className="tick-inspector"><div><span>TICK INSPECTOR / READ ONLY</span><strong>TICK {frame.tick} · ROUND {String(frame.round).padStart(2, "0")}</strong></div><div><span>PLAYER</span><strong>{selectedPlayer ? `${selectedPlayer.name} · ${selectedPlayer.health} HP` : "Все игроки"}</strong><small>{selectedPlayer ? `yaw / ${selectedPlayer.yaw.toFixed(1)}° · duck_amount / ${(selectedPlayer.duck_amount ?? 0).toFixed(2)}` : "Фильтр меняет только карту и functional layer"}</small></div><div><span>PROVENANCE</span><strong>{replay.replay_mode ?? "API replay"}</strong><small>functional_only / {String(replay.functional_only === true)}</small></div></aside>
    </> : <div className="replay-empty"><EyeOff size={24} /><div><strong>{status === "loading" ? "Загружаем реальный functional replay" : "Replay недоступен"}</strong><p>{status === "loading" ? "Подключаем read-only sidecar demo 3 без exact evidence payload." : "Проверьте доступность functional sidecar или выбранного API replay."}</p></div></div>}
  </section>;
}
