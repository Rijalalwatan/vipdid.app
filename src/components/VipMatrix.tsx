const streams = [
  { id: 'one', glyphs: 'VIP     VIP     VIP     VIP     VIP' },
  { id: 'two', glyphs: 'VIP     VIP     VIP     VIP     VIP' },
  { id: 'three', glyphs: 'VIP     VIP     VIP     VIP     VIP' },
  { id: 'four', glyphs: 'VIP     VIP     VIP     VIP     VIP' },
  { id: 'five', glyphs: 'VIP     VIP     VIP     VIP     VIP' },
  { id: 'six', glyphs: 'VIP     VIP     VIP     VIP     VIP' }
] as const;

type VipMatrixProps = { className?: string };

export function VipMatrix({ className = '' }: VipMatrixProps) {
  return (
    <div className={`vip-matrix ${className}`.trim()} aria-hidden="true">
      {streams.map((stream) => <span className={`matrix-stream matrix-stream-${stream.id}`} key={stream.id}>{stream.glyphs}</span>)}
    </div>
  );
}
