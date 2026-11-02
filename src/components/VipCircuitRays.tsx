export function VipCircuitRays() {
  return (
    <svg className="vip-circuit-rays" viewBox="0 0 1000 640" preserveAspectRatio="none" aria-hidden="true">
      <path className="circuit-ray circuit-ray-one" d="M500 256 C418 230 350 154 74 94" />
      <path className="circuit-ray circuit-ray-two" d="M500 256 C350 252 230 270 48 326" />
      <path className="circuit-ray circuit-ray-three" d="M500 256 C392 318 280 442 130 564" />
      <path className="circuit-ray circuit-ray-four" d="M500 256 C582 230 650 154 926 94" />
      <path className="circuit-ray circuit-ray-five" d="M500 256 C650 252 770 270 952 326" />
      <path className="circuit-ray circuit-ray-six" d="M500 256 C608 318 720 442 870 564" />
      <circle className="circuit-node circuit-node-one" cx="74" cy="94" r="5" />
      <circle className="circuit-node circuit-node-two" cx="48" cy="326" r="5" />
      <circle className="circuit-node circuit-node-three" cx="130" cy="564" r="5" />
      <circle className="circuit-node circuit-node-four" cx="926" cy="94" r="5" />
      <circle className="circuit-node circuit-node-five" cx="952" cy="326" r="5" />
      <circle className="circuit-node circuit-node-six" cx="870" cy="564" r="5" />
    </svg>
  );
}
