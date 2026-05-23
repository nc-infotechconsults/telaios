
const KEYFRAMES = `
@keyframes meshBlob1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(60px, -40px) scale(1.08); }
  66%       { transform: translate(-30px, 50px) scale(0.95); }
}
@keyframes meshBlob2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(-70px, 30px) scale(1.1); }
  66%       { transform: translate(50px, -50px) scale(0.92); }
}
@keyframes meshBlob3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%       { transform: translate(40px, 60px) scale(1.06); }
}
@keyframes meshBlob4 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  40%       { transform: translate(-50px, -30px) scale(0.94); }
  80%       { transform: translate(30px, 40px) scale(1.05); }
}
`;

export default function MeshBackground() {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {/* Blue blob — top-left */}
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-5%",
            width: "55vw",
            height: "55vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, #0a84ff 0%, transparent 70%)",
            filter: "blur(80px)",
            opacity: 0.22,
            animation: "meshBlob1 28s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        {/* Purple blob — top-right */}
        <div
          style={{
            position: "absolute",
            top: "-15%",
            right: "-10%",
            width: "50vw",
            height: "50vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, #bf5af2 0%, transparent 70%)",
            filter: "blur(80px)",
            opacity: 0.20,
            animation: "meshBlob2 34s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        {/* Green blob — bottom-left */}
        <div
          style={{
            position: "absolute",
            bottom: "-15%",
            left: "-5%",
            width: "45vw",
            height: "45vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, #30d158 0%, transparent 70%)",
            filter: "blur(80px)",
            opacity: 0.15,
            animation: "meshBlob3 22s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        {/* Warm/orange blob — bottom-right */}
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-5%",
            width: "48vw",
            height: "48vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, #ff9f0a 0%, transparent 70%)",
            filter: "blur(80px)",
            opacity: 0.14,
            animation: "meshBlob4 30s ease-in-out infinite",
            willChange: "transform",
          }}
        />
      </div>
    </>
  );
}
