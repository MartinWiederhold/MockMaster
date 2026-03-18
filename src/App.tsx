import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Point = { x: number; y: number };
type NotchSpec = {
  centerRatio: number;
  widthRatio: number;
  heightRatio: number;
  insetRatio: number;
};

declare global {
  interface Window {
    cv: any;
  }
}

function App() {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseInputRef = useRef<HTMLInputElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);

  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [overlayImg, setOverlayImg] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [status, setStatus] = useState("OpenCV lädt...");
  const [showGuides, setShowGuides] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [glassEnabled, setGlassEnabled] = useState(true);
  const [notchEnabled, setNotchEnabled] = useState(true);
  const [detectedNotch, setDetectedNotch] = useState<NotchSpec | null>(null);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

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

  const orderQuadPoints = (pts: Point[]): Point[] => {
    const sums = pts.map((p) => p.x + p.y);
    const diffs = pts.map((p) => p.x - p.y);

    const topLeft = pts[sums.indexOf(Math.min(...sums))];
    const bottomRight = pts[sums.indexOf(Math.max(...sums))];
    const topRight = pts[diffs.indexOf(Math.max(...diffs))];
    const bottomLeft = pts[diffs.indexOf(Math.min(...diffs))];

    return [topLeft, topRight, bottomRight, bottomLeft];
  };

  const loadImageFromFile = (file: File, cb: (img: HTMLImageElement) => void) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      cb(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const getQuadMetrics = () => {
    if (points.length !== 4) return null;

    const [p0, p1, p2, p3] = points;
    const topVec = { x: p1.x - p0.x, y: p1.y - p0.y };
    const topWidth = Math.hypot(topVec.x, topVec.y);
    const edgeUnit = { x: topVec.x / topWidth, y: topVec.y / topWidth };

    const topMid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const quadCenter = { x: (p0.x + p1.x + p2.x + p3.x) / 4, y: (p0.y + p1.y + p2.y + p3.y) / 4 };
    const inwardVec = { x: quadCenter.x - topMid.x, y: quadCenter.y - topMid.y };
    const inwardLen = Math.hypot(inwardVec.x, inwardVec.y) || 1;
    const inwardUnit = { x: inwardVec.x / inwardLen, y: inwardVec.y / inwardLen };

    const leftHeight = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    const rightHeight = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const avgHeight = (leftHeight + rightHeight) / 2;

    return {
      p0,
      p1,
      p2,
      p3,
      topWidth,
      avgHeight,
      edgeUnit,
      inwardUnit,
    };
  };

  const drawOrientedRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    edgeUnit: { x: number; y: number },
    inwardUnit: { x: number; y: number }
  ) => {
    const toCanvas = (lx: number, ly: number) => ({
      x: x + edgeUnit.x * lx + inwardUnit.x * ly,
      y: y + edgeUnit.y * lx + inwardUnit.y * ly,
    });

    const r = Math.min(radius, width / 2, height / 2);

    const p1 = toCanvas(r, 0);
    const p2 = toCanvas(width - r, 0);
    const p3 = toCanvas(width, r);
    const p4 = toCanvas(width, height - r);
    const p5 = toCanvas(width - r, height);
    const p6 = toCanvas(r, height);
    const p7 = toCanvas(0, height - r);
    const p8 = toCanvas(0, r);

    const c1 = toCanvas(width, 0);
    const c2 = toCanvas(width, height);
    const c3 = toCanvas(0, height);
    const c4 = toCanvas(0, 0);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.quadraticCurveTo(c1.x, c1.y, p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.quadraticCurveTo(c2.x, c2.y, p5.x, p5.y);
    ctx.lineTo(p6.x, p6.y);
    ctx.quadraticCurveTo(c3.x, c3.y, p7.x, p7.y);
    ctx.lineTo(p8.x, p8.y);
    ctx.quadraticCurveTo(c4.x, c4.y, p1.x, p1.y);
    ctx.closePath();
  };

  const applyDetectedNotchMask = (ctx: CanvasRenderingContext2D) => {
    if (!notchEnabled || !detectedNotch) return;

    const metrics = getQuadMetrics();
    if (!metrics) return;

    const { p0, topWidth, avgHeight, edgeUnit, inwardUnit } = metrics;
    const width = topWidth * detectedNotch.widthRatio;
    const height = avgHeight * detectedNotch.heightRatio;
    const inset = avgHeight * detectedNotch.insetRatio;
    const leftOffset = topWidth * detectedNotch.centerRatio - width / 2;

    const startX = p0.x + edgeUnit.x * leftOffset + inwardUnit.x * inset;
    const startY = p0.y + edgeUnit.y * leftOffset + inwardUnit.y * inset;
    const radius = Math.max(2, height * 0.35);

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    drawOrientedRoundedRect(ctx, startX, startY, width, height, radius, edgeUnit, inwardUnit);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.32)";
    ctx.lineWidth = 1;
    drawOrientedRoundedRect(ctx, startX, startY, width, height, radius, edgeUnit, inwardUnit);
    ctx.stroke();
    ctx.restore();
  };

  const drawGuides = (ctx: CanvasRenderingContext2D) => {
    if (!showGuides || points.length !== 4) return;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f97316";
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
      ctx.strokeStyle = "#f97316";
      ctx.stroke();

      ctx.fillStyle = "#f97316";
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

        if (glassEnabled) {
          const quadPath = new Path2D();
          quadPath.moveTo(points[0].x, points[0].y);
          points.slice(1).forEach((p) => quadPath.lineTo(p.x, p.y));
          quadPath.closePath();

          const gradient = ctx.createLinearGradient(
            points[0].x,
            points[0].y,
            points[2].x,
            points[2].y
          );
          gradient.addColorStop(0, "rgba(255,255,255,0.08)");
          gradient.addColorStop(0.45, "rgba(255,160,80,0.05)");
          gradient.addColorStop(1, "rgba(255,255,255,0)");

          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = gradient;
          ctx.fill(quadPath);
          ctx.restore();

          const centerX = (points[0].x + points[2].x) / 2;
          const centerY = (points[0].y + points[2].y) / 2;
          const vignette = ctx.createRadialGradient(
            centerX,
            centerY,
            20,
            centerX,
            centerY,
            Math.max(canvas.width, canvas.height) * 0.35
          );
          vignette.addColorStop(0, "rgba(0,0,0,0)");
          vignette.addColorStop(1, "rgba(0,0,0,0.16)");

          ctx.save();
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = vignette;
          ctx.fill(quadPath);
          ctx.restore();
        }

        applyDetectedNotchMask(ctx);

        src.delete();
        dst.delete();
        srcTri.delete();
        dstTri.delete();
        M.delete();

        if (!forExport) setStatus("Image auf Mockup angewendet");
      } catch (e) {
        console.error(e);
        setStatus("Fehler bei der Perspektivtransformation");
      }
    }

    if (!forExport) drawGuides(ctx);
  };

  const redrawAll = () => {
    drawBase();
    drawOverlay();
  };

  useEffect(() => {
    redrawAll();
  }, [
    baseImg,
    overlayImg,
    points,
    cvReady,
    showGuides,
    overlayOpacity,
    glassEnabled,
    notchEnabled,
    detectedNotch,
  ]);

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
        setDetectedNotch(null);
        setStatus("Screen automatisch erkannt");
        requestAnimationFrame(() => requestAnimationFrame(redrawAll));
      } else {
        setStatus("Kein passender Screen gefunden – bitte manuell nachjustieren");
      }
    } catch (error) {
      console.error(error);
      setStatus("Fehler bei der automatischen Erkennung");
    }
  };

  const detectDeviceNotch = () => {
    if (!baseImg || points.length !== 4 || !cvReady || !window.cv) {
      setStatus("Bitte zuerst Mockup laden und Screen erkennen");
      return;
    }

    try {
      setStatus("Geräte-Notch wird erkannt...");
      const cv = window.cv;

      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = baseImg.width;
      srcCanvas.height = baseImg.height;
      const srcCtx = srcCanvas.getContext("2d");
      if (!srcCtx) return;
      srcCtx.drawImage(baseImg, 0, 0);

      const src = cv.imread(srcCanvas);

      const topWidth = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const bottomWidth = Math.hypot(points[2].x - points[3].x, points[2].y - points[3].y);
      const leftHeight = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);
      const rightHeight = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);

      const warpW = Math.max(600, Math.round((topWidth + bottomWidth) / 2));
      const warpH = Math.max(400, Math.round((leftHeight + rightHeight) / 2));

      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        points[0].x, points[0].y,
        points[1].x, points[1].y,
        points[2].x, points[2].y,
        points[3].x, points[3].y,
      ]);

      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        warpW, 0,
        warpW, warpH,
        0, warpH,
      ]);

      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const warped = new cv.Mat.zeros(warpH, warpW, src.type());
      cv.warpPerspective(
        src,
        warped,
        M,
        new cv.Size(warpW, warpH),
        cv.INTER_LINEAR,
        cv.BORDER_REPLICATE,
        new cv.Scalar()
      );

      const gray = new cv.Mat();
      cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY, 0);

      const topBandHeight = Math.max(40, Math.round(warpH * 0.18));
      const roiX = Math.round(warpW * 0.22);
      const roiW = Math.round(warpW * 0.56);

      const topBandRect = new cv.Rect(roiX, 0, roiW, topBandHeight);
      const topBand = gray.roi(topBandRect);

      const thresh = new cv.Mat();
      cv.threshold(topBand, thresh, 70, 255, cv.THRESH_BINARY_INV);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestRect: { x: number; y: number; width: number; height: number; score: number } | null = null;

      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const rect = cv.boundingRect(c);
        const area = rect.width * rect.height;
        const centerX = rect.x + rect.width / 2;
        const centerDist = Math.abs(centerX - roiW / 2);
        const aspect = rect.width / Math.max(rect.height, 1);

        const valid =
          area > roiW * topBandHeight * 0.004 &&
          rect.y < topBandHeight * 0.7 &&
          aspect > 1.2 &&
          aspect < 8.5 &&
          rect.width > roiW * 0.05 &&
          rect.width < roiW * 0.55;

        if (valid) {
          const score = area - centerDist * 10;
          if (!bestRect || score > bestRect.score) {
            bestRect = {
              x: rect.x + roiX,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              score,
            };
          }
        }

        c.delete();
      }

      if (bestRect) {
        const notchSpec: NotchSpec = {
          centerRatio: (bestRect.x + bestRect.width / 2) / warpW,
          widthRatio: bestRect.width / warpW,
          heightRatio: Math.max(0.02, bestRect.height / warpH),
          insetRatio: Math.max(0, bestRect.y / warpH),
        };

        setDetectedNotch(notchSpec);
        setStatus("Geräte-Notch erkannt");
      } else {
        setDetectedNotch(null);
        setStatus("Keine Geräte-Notch erkannt");
      }

      src.delete();
      srcTri.delete();
      dstTri.delete();
      M.delete();
      warped.delete();
      gray.delete();
      topBand.delete();
      thresh.delete();
      contours.delete();
      hierarchy.delete();

      requestAnimationFrame(() => requestAnimationFrame(redrawAll));
    } catch (error) {
      console.error(error);
      setStatus("Fehler bei der Geräte-Notch-Erkennung");
    }
  };

  const handleBaseUpload = (file?: File) => {
    if (!file) return;
    loadImageFromFile(file, (img) => {
      setBaseImg(img);
      setPoints(createInsetPoints(img.width, img.height));
      setDetectedNotch(null);
      setStatus("Mockup geladen");
    });
  };

  const handleOverlayUpload = (file?: File) => {
    if (!file) return;
    loadImageFromFile(file, (img) => {
      setOverlayImg(img);
      setStatus("Image geladen");
      requestAnimationFrame(() => requestAnimationFrame(redrawAll));
    });
  };

  const getCanvasPoint = (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX / zoomLevel,
      y: (event.clientY - rect.top) * scaleY / zoomLevel,
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
    setDetectedNotch(null);
    setStatus("Punkte zurückgesetzt");
  };

  const resetAll = () => {
    setBaseImg(null);
    setOverlayImg(null);
    setPoints([]);
    setDetectedNotch(null);
    setDragIndex(null);
    setOverlayOpacity(100);
    setZoomEnabled(false);
    setZoomLevel(1);
    setStatus("Alles zurückgesetzt");
    if (baseInputRef.current) baseInputRef.current.value = "";
    if (overlayInputRef.current) overlayInputRef.current.value = "";
  };

  const exportImage = () => {
    drawOverlay(true);
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "mockmaster-export.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    drawOverlay(false);
    setStatus("PNG exportiert");
  };

  return (
    <main className="app">
      <aside className="sidebar">
        <h1>MockMaster</h1>
        <p className="sub">Black edition</p>

        <div className="panel">
          <label className="upload">
            <span>1. Mockup laden</span>
            <input
              ref={baseInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleBaseUpload(e.target.files?.[0])}
            />
          </label>

          <label className="upload">
            <span>2. Image laden</span>
            <input
              ref={overlayInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleOverlayUpload(e.target.files?.[0])}
            />
          </label>

          <button onClick={autoDetectScreen}>Screen automatisch erkennen</button>
          <button onClick={detectDeviceNotch}>Geräte-Notch erkennen</button>
          <button onClick={resetPoints}>Punkte resetten</button>
          <button onClick={resetAll}>Alles zurücksetzen</button>
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
              checked={glassEnabled}
              onChange={(e) => setGlassEnabled(e.target.checked)}
            />
            <span>Glass Layer aktiv</span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={notchEnabled}
              onChange={(e) => setNotchEnabled(e.target.checked)}
            />
            <span>Geräte-Notch freistellen</span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={zoomEnabled}
              onChange={() => {
                const next = !zoomEnabled;
                setZoomEnabled(next);
                setZoomLevel(next ? 2 : 1);
              }}
            />
            <span>Zoom aktivieren</span>
          </label>

          {zoomEnabled && (
            <div className="control">
              <label htmlFor="zoom">Zoom: {zoomLevel.toFixed(1)}x</label>
              <input
                id="zoom"
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value))}
              />
            </div>
          )}

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
            Workflow:
            <br />
            1. Mockup laden
            <br />
            2. Screen automatisch erkennen
            <br />
            3. Geräte-Notch erkennen
            <br />
            4. Image laden
          </div>
        </div>
      </aside>

      <section className="stage">
        <div className="glow-orb orb-1" />
        <div className="glow-orb orb-2" />
        <div
          className="canvas-scale-shell"
          style={{ transform: `scale(${zoomLevel})` }}
        >
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
        </div>
      </section>
    </main>
  );
}

export default App;
