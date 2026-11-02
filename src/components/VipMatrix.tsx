const streams = [
  { id: 'one', glyphs: 'V\nI\nP\n0\n1\n0\nV\nI\nP\n7\n2\n0\n1\nV\nI\nP\n4\n8\n0\n1\nV\nI\nP' },
  { id: 'two', glyphs: '0\n1\nV\nI\nP\n3\n8\n0\n1\nV\nI\nP\n6\n0\n1\nV\nI\nP\n9\n2\n0\n1' },
  { id: 'three', glyphs: 'P\nI\nV\n5\n0\n1\nV\nI\nP\n0\n7\n1\nV\nI\nP\n2\n0\n1\nV\nI\nP' },
  { id: 'four', glyphs: '1\n0\nV\nI\nP\n8\n4\n0\n1\nV\nI\nP\n0\n1\n6\nV\nI\nP\n3\n0' },
  { id: 'five', glyphs: 'V\nI\nP\n2\n0\n1\n9\nV\nI\nP\n0\n1\n4\n7\nV\nI\nP\n0\n1\n8' },
  { id: 'six', glyphs: '0\n1\n5\nV\nI\nP\n0\n1\nV\nI\nP\n3\n0\n1\nV\nI\nP\n6\n2\n0' },
  { id: 'seven', glyphs: 'I\nP\nV\n0\n1\n7\nV\nI\nP\n2\n0\n1\nV\nI\nP\n5\n0\n1\n9' },
  { id: 'eight', glyphs: '0\nV\nI\nP\n4\n1\n0\nV\nI\nP\n8\n0\n1\nV\nI\nP\n3\n0\n1' }
] as const;

type VipMatrixProps = { className?: string };

export function VipMatrix({ className = '' }: VipMatrixProps) {
  return (
    <div className={`vip-matrix ${className}`.trim()} aria-hidden="true">
      {streams.map((stream) => <span className={`matrix-stream matrix-stream-${stream.id}`} key={stream.id}>{stream.glyphs}</span>)}
    </div>
  );
}
