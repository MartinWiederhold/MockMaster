import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Point = { x: number; y: number };

declare global {
  interface Window {
    cv: any;
  }
}

function App() {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [overlayImg, setOverlayImg] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [status, setStatus] = useState("OpenCV lädt...");
  const [showGuides, setShowGuides] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(100);

  useEffect(() => {
    const existing = document.getElementById("opencv-script");
    if (existing) {
      const check = setInterval(() => {
        if (window.cv?.getBuildInformation) {
          setCvReady(true);
          setStatus("OpenCV bereit");
          clearInterval(check);
        }
      }, 300);
      return () => clearInterval(check);
    }

    const script = document.createElement("script");
    script.id = "opencv-script";
    script.async = true;
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.onload = () => {
      const check = setInterval(() => {
        if (window.cv?.getBuildInformation) {
          setCvReady(true);
          setStatus("OpenCV bereit");
          clearInterval(check);
        }
      }, 300);
    };
    script.onerror = () => setStatus("OpenCV konnte nicht geladen werden");
    document.body.appendChild(script);
  }, []);

  const canvasSize = useMemo(() => {
    if (!baseImg) return { width: 1200, height: 800 };
    return { width: baseImg.width, height: baseImg.height };
  }, [baseImg]);

  const createInsetPoints = (width: number, height: number): Point[] => {
    const marginX = width * 0.2;
    const marginY = height * 0.2;
    return [
      { x: marginX, y: marginY },
      { x: width - marginX, y: marginY },
      { x: width - marginX, y: height - marginY },
      { x: marginX, y: height - marginY },
    ];
  };

  const drawGuides = (ctx: CanvasRenderingContext2D) => {
    if (!showGuides || points.length !== 4) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#8b5cf6";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();

    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#8b5cf6";
      ctx.stroke();

      ctx.fillStyle = "#8b5cf6";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(String(i + 1), p.x + 14, p.y - 14);
    });
    ctx.restore();
  };

  const drawBase = () => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGuides(ctx);
  };

  const drawOverlay = (forExport = false) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!baseImg) return;
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

    if (overlayImg && cvReady && window.cv && points.length === 4) {
      try {
        const cv = window.cv;

        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = overlayImg.width;
        srcCanvas.height = overlayImg.height;
        const srcCtx = srcCanvas.getContext("2d");
        if (!srcCtx) return;
        srcCtx.drawImage(overlayImg, 0, 0);

        const src = cv.imread(srcCanvas);
        const dst = new cv.Mat.zeros(canvas.height, canvas.width, src.type());

        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          overlayImg.width, 0,
          overlayImg.width, overlayImg.height,
          0, overlayImg.height,
        ]);

        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
          points[0].x, points[0].y,
          points[1].x, points[1].y,
          points[2].x, points[2].y,
          points[3].x, points[3].y,
        ]);

        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        const dsize = new cv.Size(canvas.width, canvas.height);

        cv.warpPerspective(
          src,
          dst,
          M,
          dsize,
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(0, 0, 0, 0)
        );

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        cv.imshow(tempCanvas, dst);

        ctx.save();
        ctx.globalAlpha = overlayOpacity / 100;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.restore();

        // --- Glass Reflection Effect ---
        const gradient = ctx.createLinearGradient(
          points[0].x,
          points[0].y,
          points[2].x,
          points[2].y
        );
        gradient.addColorStop(0, "rgba(255,255,255,0.08)");
        gradient.addColorStop(0.5, "rgba(255,255,255,0.03)");
        gradient.addColorStop(1, "rgba(255,255,255,0.0)");

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // --- Advanced Screen Glow ---
        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // --- Subtle Vignette ---
        const centerX = (points[0].x + points[2].x) / 2;
        const centerY = (points[0].y + points[2].y) / 2;
        const vignette = ctx.createRadialGradient(
          centerX,
          centerY,
          10,
          centerX,
          centerY,
          600
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.15)");

        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = vignette;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        src.delete();
        dst.delete();
        srcTri.delete();
        dstTri.delete();
        M.delete();

        if (!forExport) {
          setStatus("Image auf Mockup angewendet");
        }
      } catch (e) {
        console.error(e);
        setStatus("Fehler bei der Perspektivtransformation");
      }
    }

    if (!forExport) {
      drawGuides(ctx);
    }
  };

  useEffect(() => {
    drawBase();
  }, [baseImg, points, canvasSize, showGuides]);

  useEffect(() => {
    drawOverlay();
  }, [baseImg, overlayImg, points, cvReady, canvasSize, showGuides, overlayOpacity]);

  const loadImageFromFile = (file: File, cb: (img: HTMLImageElement) => void) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      cb(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleBaseUpload = (file?: File) => {
    if (!file) return;
    loadImageFromFile(file, (img) => {
      setBaseImg(img);
      setPoints(createInsetPoints(img.width, img.height));
      setStatus("Mockup geladen");
    });
  };

  const handleOverlayUpload = (file?: File) => {
    if (!file) return;
    loadImageFromFile(file, (img) => {
      setOverlayImg(img);
      setStatus("Image geladen");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => drawOverlay());
      });
    });
  };

  const orderQuadPoints = (pts: Point[]): Point[] => {
    const sums = pts.map((p) => p.x + p.y);
    const diffs = pts.map((p) => p.x - p.y);

    const topLeft = pts[sums.indexOf(Math.min(...sums))];
    const bottomRight = pts[sums.indexOf(Math.max(...sums))];
    const topRight = pts[diffs.indexOf(Math.max(...diffs))];
    const bottomLeft = pts[diffs.indexOf(Math.min(...diffs))];

    return [topLeft, topRight, bottomRight, bottomLeft];
  };

  const autoDetectScreen = () => {
    if (!baseImg || !cvReady || !window.cv) {
      setStatus("Bitte zuerst Mockup laden und auf OpenCV warten");
      return;
    }

    try {
      setStatus("Screen-Erkennung läuft...");
      const cv = window.cv;

      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = baseImg.width;
      srcCanvas.height = baseImg.height;
      const srcCtx = srcCanvas.getContext("2d");
      if (!srcCtx) return;
      srcCtx.drawImage(baseImg, 0, 0);

      const src = cv.imread(srcCanvas);
      const gray = new cv.Mat();
      const blur = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
      cv.Canny(blur, edges, 75, 200);

      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(edges, edges, kernel);

      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let bestArea = 0;
      let bestQuad: Point[] | null = null;
      const minArea = baseImg.width * baseImg.height * 0.03;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const perimeter = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

        if (approx.rows === 4) {
          const area = Math.abs(cv.contourArea(approx));
          const isConvex = cv.isContourConvex(approx);

          if (isConvex && area > minArea && area > bestArea) {
            const data = approx.data32S;
            const pts: Point[] = [
              { x: data[0], y: data[1] },
              { x: data[2], y: data[3] },
              { x: data[4], y: data[5] },
              { x: data[6], y: data[7] },
            ];
            bestQuad = orderQuadPoints(pts);
            bestArea = area;
          }
        }

        approx.delete();
        contour.delete();
      }

      kernel.delete();
      src.delete();
      gray.delete();
      blur.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();

      if (bestQuad) {
        setPoints(bestQuad);
        setStatus("Screen automatisch erkannt");
      } else {
        setStatus("Kein passender Screen gefunden – bitte manuell nachjustieren");
      }
    } catch (error) {
      console.error(error);
      setStatus("Fehler bei der automatischen Erkennung");
    }
  };

  const getCanvasPoint = (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPoint(event);
    const hitIndex = points.findIndex((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 22);
    if (hitIndex >= 0) setDragIndex(hitIndex);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragIndex === null) return;
    const pos = getCanvasPoint(event);
    setPoints((prev) =>
      prev.map((p, i) => (i === dragIndex ? { x: pos.x, y: pos.y } : p))
    );
  };

  const handleMouseUp = () => setDragIndex(null);

  const resetPoints = () => {
    if (!baseImg) return;
    setPoints(createInsetPoints(baseImg.width, baseImg.height));
    setStatus("Punkte zurückgesetzt");
  };

  const exportImage = () => {
    drawOverlay(true);
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "screenfit-export.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    drawOverlay(false);
    setStatus("PNG exportiert");
  };

  return (
    <main className="app">
      <aside className="sidebar">
        <h1>screenfit</h1>
        <p className="sub">BMAD MVP – auto detect</p>

        <div className="panel">
          <label className="upload">
            <span>1. Mockup laden</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleBaseUpload(e.target.files?.[0])}
            />
          </label>

          <label className="upload">
            <span>2. Image laden</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleOverlayUpload(e.target.files?.[0])}
            />
          </label>

          <button onClick={autoDetectScreen}>Screen automatisch erkennen</button>
          <button onClick={resetPoints}>Punkte resetten</button>
          <button onClick={exportImage}>PNG exportieren</button>

          <div className="control">
            <label htmlFor="opacity">Image Opacity: {overlayOpacity}%</label>
            <input
              id="opacity"
              type="range"
              min="0"
              max="100"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            />
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showGuides}
              onChange={(e) => setShowGuides(e.target.checked)}
            />
            <span>Guides anzeigen</span>
          </label>

          <div className="status">
            <strong>Status:</strong> {status}
          </div>

          <div className="hint">
            Reihenfolge:
            <br />
            1 = oben links
            <br />
            2 = oben rechts
            <br />
            3 = unten rechts
            <br />
            4 = unten links
          </div>
        </div>
      </aside>

      <section className="stage">
        <div className="canvas-wrap">
          <canvas ref={overlayCanvasRef} className="main-canvas rendered" />
          <canvas
            ref={baseCanvasRef}
            className="main-canvas interactive"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
