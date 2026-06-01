export default function MeshBackground() {
  return (
    <div className="bg-mesh" aria-hidden="true">
      <div className="bg-blob" style={{ top: "-10%", left: "-5%", width: "55vw", height: "55vw", animationName: "floatBlob1" }} />
      <div className="bg-blob" style={{ top: "-15%", right: "-10%", width: "50vw", height: "50vw", animationDuration: "34s", animationName: "floatBlob2" }} />
      <div className="bg-blob" style={{ bottom: "-15%", left: "-5%", width: "45vw", height: "45vw", animationDuration: "22s", animationName: "floatBlob3" }} />
      <div className="bg-blob" style={{ bottom: "-10%", right: "-5%", width: "48vw", height: "48vw", animationDuration: "30s", animationName: "floatBlob4" }} />
      <div className="bg-grain" />
    </div>
  );
}
