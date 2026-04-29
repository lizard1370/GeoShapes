// ...existing code...
const GRID_SIZE = 20;
const SNAP_THRESHOLD = 10;
const POINT_RADIUS = 6; // screen pixels for handles

const gridCanvas = document.getElementById('gridCanvas');
const gridCtx = gridCanvas.getContext('2d');
const shapesCtx = shapesCanvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const selectedInfo = document.getElementById('selectedInfo');
const pointsInfo = document.getElementById('pointsInfo');
const anglesInfo = document.getElementById('anglesInfo');
const anglesRow = document.getElementById('anglesRow');
const coordInput = document.getElementById('coordInput');
const createBtn = document.getElementById('createBtn');
const showAxesToggle = document.getElementById('showAxesToggle');

let touchStartX = 0;
let touchStartY = 0;
let touchStartOffsetX = 0;
let touchStartOffsetY = 0;
let isTouchPanning = false;
let lastTouchDistance = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;
let shapes = [];
let selectedShape = null;
let currentShapeType = null;
let currentShapePoints = [];
let isDragging = false;
let dragPointIndex = -1;
let isDraggingShape = false;
let dragOffset = { x: 0, y: 0 };
let hoveredPoint = null;
let showAxesNumbers = false;

// world transform state
let scale = 1;
let offsetX = 0;
let offsetY = 0;

function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - offsetX) / scale,
        y: (screenY - offsetY) / scale
    };
}

function worldToScreen(worldX, worldY) {
    return {
        x: worldX * scale + offsetX,
        y: worldY * scale + offsetY
    };
}
function getTouchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function resizeCanvases() {
    gridCanvas.width = window.innerWidth;
    gridCanvas.height = window.innerHeight;
    shapesCanvas.width = window.innerWidth;
    shapesCanvas.height = window.innerHeight;
    // keep view centered on resize roughly (optional)
    drawGrid();
    drawAllShapes();
}

function saveToJSON() {
    const data = {
        shapes: shapes,
        scale: scale,
        offsetX: offsetX,
        offsetY: offsetY
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geoshapes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadFromJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            shapes = data.shapes || [];
            scale = data.scale || 1;
            offsetX = data.offsetX || 0;
            offsetY = data.offsetY || 0;
            selectedShape = null;
            checkCollisions();
            updateInfoPanel();
            drawGrid();
            drawAllShapes();
        } catch (err) {
            alert('Error loading file: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// Add hidden file input for loading
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.json';
fileInput.style.display = 'none';
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        loadFromJSON(e.target.files[0]);
        fileInput.value = '';
    }
});
document.body.appendChild(fileInput);

// Add Save/Load buttons to toolbar
const saveLoadHTML = `
    <div class="save-load-controls">
        <button class="btn" id="saveBtn" title="Save (Ctrl+S)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <!-- outer shape -->
            <path d="M4 4h12l4 4v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
            
            <!-- top slot -->
            <path d="M8 4v5h8V4"/>
            
            <!-- label / disk window -->
            <rect x="8" y="13" width="8" height="5" rx="1"/>
            </svg>
        </button>
        <button class="btn" id="loadBtn" title="Load">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Tray -->
            <path d="M3 15V18C3 19.1 3.9 20 5 20H19C20.1 20 21 19.1 21 18V15"
                    stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            
            <!-- Arrow shaft -->
            <path d="M12 3V14"
                    stroke="black" stroke-width="2" stroke-linecap="round"/>
            
            <!-- Arrow head -->
            <path d="M8 10L12 14L16 10"
                    stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
    </div>
`;

// Find toolbar and insert before zoom controls
const toolbar = document.querySelector('.toolbar') || document.body;
const zoomControls = document.querySelector('.zoom-controls');
if (zoomControls && zoomControls.parentNode) {
    zoomControls.parentNode.insertBefore(
        document.createElement('div'),
        zoomControls
    );
    const lastInserted = document.querySelector('.zoom-controls').previousElementSibling;
    lastInserted.innerHTML = saveLoadHTML;
} else {
    document.body.insertAdjacentHTML('beforeend', saveLoadHTML);
}

// Add CSS for save/load buttons
const saveLoadStyle = document.createElement('style');
saveLoadStyle.textContent = `
    .save-load-controls {
        position: fixed;
        right: 20px;
        top: 20px;
        display: flex;
        gap: 8px;
        z-index: 100;
    }

    .save-load-controls .btn {
        width: 40px;
        height: 40px;
    }

    .save-load-controls svg {
        width: 20px;
        height: 20px;
    }
`;
document.head.appendChild(saveLoadStyle);

// Button handlers
document.getElementById('saveBtn').addEventListener('click', saveToJSON);
document.getElementById('loadBtn').addEventListener('click', () => fileInput.click());

// Keyboard shortcut: Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveToJSON();
    }
});
shapesCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        isTouchPanning = true;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartOffsetX = offsetX;
        touchStartOffsetY = offsetY;
        lastTouchDistance = getTouchDistance(e.touches);
        return;
    }

    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = shapesCanvas.getBoundingClientRect();
        const screenX = touch.clientX - rect.left;
        const screenY = touch.clientY - rect.top;
        const pos = screenToWorld(screenX, screenY);
        const snappedPos = getSnappedPos(pos);

        if (currentShapeType) {
            if (currentShapeType === 'square' && currentShapePoints.length === 0) {
                currentShapePoints.push(snappedPos);
            } else if (currentShapeType === 'square' && currentShapePoints.length === 1) {
                const p1 = currentShapePoints[0];
                const size = Math.max(Math.abs(snappedPos.x - p1.x), Math.abs(snappedPos.y - p1.y));
                const dx = snappedPos.x >= p1.x ? size : -size;
                const dy = snappedPos.y >= p1.y ? size : -size;
                const points = [
                    { x: p1.x, y: p1.y },
                    { x: p1.x + dx, y: p1.y },
                    { x: p1.x + dx, y: p1.y + dy },
                    { x: p1.x, y: p1.y + dy }
                ];
                createShape('square', points);
                currentShapePoints = [];
                currentShapeType = null;
                document.querySelectorAll('[data-shape]').forEach(btn => btn.classList.remove('active'));
            } else if (currentShapeType === 'triangle') {
                currentShapePoints.push(snappedPos);
                if (currentShapePoints.length === 3) {
                    createShape('triangle', currentShapePoints);
                    currentShapePoints = [];
                    currentShapeType = null;
                    document.querySelectorAll('[data-shape]').forEach(btn => btn.classList.remove('active'));
                }
            } else if (currentShapeType === 'circle') {
                currentShapePoints.push(snappedPos);
                if (currentShapePoints.length === 2) {
                    createShape('circle', currentShapePoints);
                    currentShapePoints = [];
                    currentShapeType = null;
                    document.querySelectorAll('[data-shape]').forEach(btn => btn.classList.remove('active'));
                }
            }
            checkCollisions();
            drawAllShapes();
            return;
        }

        const pointFound = findPointAtPosition(pos);
        if (pointFound) {
            isDragging = true;
            dragPointIndex = pointFound.index;
            selectedShape = pointFound.shape;
            dragOffset = {
                x: pos.x - pointFound.point.x,
                y: pos.y - pointFound.point.y
            };
            updateInfoPanel();
            drawAllShapes();
            return;
        }

        const shapeFound = findShapeAtPosition(pos);
        if (shapeFound) {
            isDraggingShape = true;
            selectedShape = shapeFound;
            dragOffset = {
                x: pos.x - shapeFound.points[0].x,
                y: pos.y - shapeFound.points[0].y
            };
            updateInfoPanel();
            drawAllShapes();
        } else {
            selectedShape = null;
            updateInfoPanel();
            drawAllShapes();
        }
    }
}, { passive: true });

shapesCanvas.addEventListener('touchmove', (e) => {
    if (isTouchPanning && e.touches.length >= 1) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        offsetX = touchStartOffsetX + deltaX;
        offsetY = touchStartOffsetY + deltaY;
        drawGrid();
        drawAllShapes();

        if (e.touches.length === 2) {
            const distance = getTouchDistance(e.touches);
            if (lastTouchDistance > 0) {
                const zoomFactor = distance / lastTouchDistance;
                const newScale = Math.min(5, Math.max(0.2, scale * zoomFactor));
                scale = newScale;
                drawGrid();
                drawAllShapes();
            }
            lastTouchDistance = distance;
        }
        return;
    }
}, { passive: true });

shapesCanvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        isTouchPanning = false;
        isDragging = false;
        dragPointIndex = -1;
        isDraggingShape = false;
        lastTouchDistance = 0;
    } else if (e.touches.length === 1) {
        isTouchPanning = false;
        lastTouchDistance = 0;
    }
}, { passive: true });

shapesCanvas.addEventListener('touchcancel', (e) => {
    isTouchPanning = false;
    isDragging = false;
    dragPointIndex = -1;
    isDraggingShape = false;
    lastTouchDistance = 0;
}, { passive: true });

function drawGrid() {
    // draw grid in world coordinates using transform
    gridCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    gridCtx.clearRect(-offsetX/scale, -offsetY/scale, gridCanvas.width/scale, gridCanvas.height/scale);

    gridCtx.strokeStyle = '#e2e8f0';
    gridCtx.lineWidth = 1 / Math.max(scale, 0.0001);

    // compute visible world bounds
    const worldXMin = -offsetX / scale;
    const worldYMin = -offsetY / scale;
    const worldXMax = (gridCanvas.width - offsetX) / scale;
    const worldYMax = (gridCanvas.height - offsetY) / scale;

    // vertical lines
    let startX = Math.floor(worldXMin / GRID_SIZE) * GRID_SIZE;
    for (let x = startX; x <= worldXMax; x += GRID_SIZE) {
        gridCtx.beginPath();
        gridCtx.moveTo(x, worldYMin);
        gridCtx.lineTo(x, worldYMax);
        gridCtx.stroke();
    }

    // horizontal lines
    let startY = Math.floor(worldYMin / GRID_SIZE) * GRID_SIZE;
    for (let y = startY; y <= worldYMax; y += GRID_SIZE) {
        gridCtx.beginPath();
        gridCtx.moveTo(worldXMin, y);
        gridCtx.lineTo(worldXMax, y);
        gridCtx.stroke();
    }

    // major lines
    gridCtx.strokeStyle = '#cbd5e1';
    gridCtx.lineWidth = 2 / Math.max(scale, 0.0001);

    startX = Math.floor(worldXMin / (GRID_SIZE * 5)) * (GRID_SIZE * 5);
    for (let x = startX; x <= worldXMax; x += GRID_SIZE * 5) {
        gridCtx.beginPath();
        gridCtx.moveTo(x, worldYMin);
        gridCtx.lineTo(x, worldYMax);
        gridCtx.stroke();
    }
    startY = Math.floor(worldYMin / (GRID_SIZE * 5)) * (GRID_SIZE * 5);
    for (let y = startY; y <= worldYMax; y += GRID_SIZE * 5) {
        gridCtx.beginPath();
        gridCtx.moveTo(worldXMin, y);
        gridCtx.lineTo(worldXMax, y);
        gridCtx.stroke();
    }

    // draw axis numbers in screen-space so they are readable
    if (showAxesNumbers) {
        gridCtx.setTransform(1, 0, 0, 1, 0, 0); // reset
        gridCtx.fillStyle = '#64748b';
        gridCtx.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
        gridCtx.textAlign = 'center';
        gridCtx.textBaseline = 'top';

        startX = Math.floor(worldXMin / (GRID_SIZE * 5)) * (GRID_SIZE * 5);
        for (let x = startX; x <= worldXMax; x += GRID_SIZE * 5) {
            const sx = x * scale + offsetX;
            if (sx >= 0 && sx <= gridCanvas.width) {
                gridCtx.fillText((x / GRID_SIZE).toString(), sx + 2, 2);
            }
        }

        gridCtx.textAlign = 'right';
        gridCtx.textBaseline = 'middle';
        startY = Math.floor(worldYMin / (GRID_SIZE * 5)) * (GRID_SIZE * 5);
        for (let y = startY; y <= worldYMax; y += GRID_SIZE * 5) {
            const sy = y * scale + offsetY;
            if (sy >= 0 && sy <= gridCanvas.height) {
                gridCtx.fillText((y / GRID_SIZE).toString(), 28, sy + 2);
            }
        }
    } else {
        // reset transform before returning so other code isn't surprised
        gridCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
}

function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function getMousePos(e) {
    const rect = shapesCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return screenToWorld(screenX, screenY);
}

function getSnappedPos(pos) {
    return {
        x: snapToGrid(pos.x),
        y: snapToGrid(pos.y)
    };
}

function createShape(type, points) {
    const shape = {
        id: Date.now(),
        type: type,
        points: points,
        color: getTypeColor(type),
        collision: false
    };
    shapes.push(shape);
    return shape;
}

function getTypeColor(type) {
    switch (type) {
        case 'triangle': return '#2563eb';
        case 'square': return '#16a34a';
        case 'circle': return '#8b5cf6';
        case 'polygon': return '#0ea5a4';
        default: return '#2563eb';
    }
}

function drawShape(shape) {
    const ctx = shapesCtx;
    const isSelected = shape === selectedShape;
    const isCollision = shape.collision;

    // draw filled shape in world coordinates (transform applied by caller)
    ctx.beginPath();
    if (shape.points.length > 0) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        if (shape.type === 'circle' && shape.points.length >= 2) {
            const center = shape.points[0];
            const radius = Math.sqrt(
                Math.pow(shape.points[1].x - center.x, 2) +
                Math.pow(shape.points[1].y - center.y, 2)
            );
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        } else {
            for (let i = 1; i < shape.points.length; i++) {
                ctx.lineTo(shape.points[i].x, shape.points[i].y);
            }
            ctx.closePath();
        }
    }

    if (isCollision) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.strokeStyle = '#f59e0b';
    } else {
        ctx.fillStyle = shape.color + '33';
        ctx.strokeStyle = shape.color;
    }

    ctx.lineWidth = isSelected ? 3 / Math.max(scale, 0.0001) : 2 / Math.max(scale, 0.0001);
    ctx.fill();
    ctx.stroke();

    // draw angle labels (in world space so they move with zoom)
    if (isSelected && shape.type === 'triangle') {
        drawAngles(shape);
    }
}

function drawAllShapes() {
    // clear shapes canvas fully
    shapesCtx.setTransform(1, 0, 0, 1, 0, 0);
    shapesCtx.clearRect(0, 0, shapesCanvas.width, shapesCanvas.height);

    // apply world transform for drawing shapes
    shapesCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    shapes.forEach(shape => drawShape(shape));

    // draw preview shape (in world coords)
    if (currentShapePoints.length > 0) {
        drawPreviewShape();
    }

    // draw point handles in screen space so they stay constant-size
    shapesCtx.setTransform(1, 0, 0, 1, 0, 0);
    shapes.forEach(shape => {
        shape.points.forEach((point) => {
            const s = worldToScreen(point.x, point.y);
            shapesCtx.beginPath();
            shapesCtx.arc(s.x, s.y, POINT_RADIUS, 0, Math.PI * 2);
            const fill = (shape === selectedShape || hoveredPoint === point) ? shape.color : 'white';
            shapesCtx.fillStyle = fill;
            shapesCtx.strokeStyle = '#1e293b';
            shapesCtx.lineWidth = 2;
            shapesCtx.fill();
            shapesCtx.stroke();
        });
    });

    // preview points in screen space
    if (currentShapePoints.length > 0) {
        currentShapePoints.forEach(point => {
            const s = worldToScreen(point.x, point.y);
            shapesCtx.beginPath();
            shapesCtx.arc(s.x, s.y, POINT_RADIUS, 0, Math.PI * 2);
            shapesCtx.fillStyle = '#94a3b8';
            shapesCtx.fill();
        });
    }
}

function drawPreviewShape() {
    // draw preview using world transform
    shapesCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    const ctx = shapesCtx;
    ctx.beginPath();
    ctx.moveTo(currentShapePoints[0].x, currentShapePoints[0].y);
    for (let i = 1; i < currentShapePoints.length; i++) {
        ctx.lineTo(currentShapePoints[i].x, currentShapePoints[i].y);
    }
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2 / Math.max(scale, 0.0001);
    ctx.setLineDash([5 / Math.max(scale, 0.0001), 5 / Math.max(scale, 0.0001)]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function findPointAtPosition(pos) {
    // pos is in world coords
    for (let shape of shapes) {
        for (let i = 0; i < shape.points.length; i++) {
            const point = shape.points[i];
            const dist = Math.sqrt(Math.pow(pos.x - point.x, 2) + Math.pow(pos.y - point.y, 2));
            // use threshold in world units derived from POINT_RADIUS screen pixels
            const worldRadius = POINT_RADIUS / Math.max(scale, 0.0001);
            if (dist < worldRadius * 1.8) {
                return { shape, index: i, point };
            }
        }
    }
    return null;
}

function findShapeAtPosition(pos) {
    for (let shape of shapes) {
        if (isPointInShape(pos, shape)) {
            return shape;
        }
    }
    return null;
}

function isPointInShape(pos, shape) {
    if (shape.type === 'circle' && shape.points.length >= 2) {
        const center = shape.points[0];
        const r = Math.sqrt(Math.pow(shape.points[1].x - center.x, 2) + Math.pow(shape.points[1].y - center.y, 2));
        const d = Math.sqrt(Math.pow(pos.x - center.x, 2) + Math.pow(pos.y - center.y, 2));
        return d <= r;
    }
    if (shape.points.length < 3) return false;

    let inside = false;
    const points = shape.points;
    const x = pos.x, y = pos.y;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;

        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }

    return inside;
}

function checkCollisions() {
    shapes.forEach(shape => shape.collision = false);

    for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
            if (shapesIntersect(shapes[i], shapes[j])) {
                shapes[i].collision = true;
                shapes[j].collision = true;
            }
        }
    }
}

function shapesIntersect(shape1, shape2) {
    for (let p of shape1.points) {
        if (isPointInShape(p, shape2)) return true;
    }
    for (let p of shape2.points) {
        if (isPointInShape(p, shape1)) return true;
    }
    return false;
}

function getShapeCenter(shape) {
    let sumX = 0, sumY = 0;
    shape.points.forEach(p => {
        sumX += p.x;
        sumY += p.y;
    });
    return {
        x: sumX / shape.points.length,
        y: sumY / shape.points.length
    };
}

function calculateAngles(shape) {
    if (shape.type !== 'triangle' || shape.points.length < 3) {
        return null;
    }

    const p1 = shape.points[0];
    const p2 = shape.points[1];
    const p3 = shape.points[2];

    function getAngle(pA, pB, pC) {
        const dx1 = pA.x - pB.x;
        const dy1 = pA.y - pB.y;
        const dx2 = pC.x - pB.x;
        const dy2 = pC.y - pB.y;

        const dot = dx1 * dx2 + dy1 * dy2;
        const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (mag1 === 0 || mag2 === 0) return 0;

        const cos = dot / (mag1 * mag2);
        const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
        return (angle * 180 / Math.PI).toFixed(1);
    }

    return {
        A: getAngle(p2, p1, p3),
        B: getAngle(p1, p2, p3),
        C: getAngle(p1, p3, p2)
    };
}

function drawAngles(shape) {
    const angles = calculateAngles(shape);
    if (!angles) return;

    const ctx = shapesCtx;
    ctx.fillStyle = shape.color;
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    shape.points.forEach((point, i) => {
        const angle = i === 0 ? angles.A : i === 1 ? angles.B : angles.C;
        const offset = 0.75 * GRID_SIZE; // world units so it moves with zoom
        const ox = point.x + offset;
        const oy = point.y - offset;
        ctx.fillText(angle + '°', ox, oy);
    });
}

function rotateShape(shape) {
    const center = getShapeCenter(shape);

    shape.points.forEach(point => {
        const x = point.x - center.x;
        const y = point.y - center.y;
        point.x = center.x - y;
        point.y = center.y + x;
    });
}

function flipShapeHorizontal(shape) {
    const center = getShapeCenter(shape);
    shape.points.forEach(point => {
        point.x = center.x * 2 - point.x;
    });
}

function flipShapeVertical(shape) {
    const center = getShapeCenter(shape);
    shape.points.forEach(point => {
        point.y = center.y * 2 - point.y;
    });
}

function updateInfoPanel() {
    if (selectedShape) {
        selectedInfo.textContent = selectedShape.type.charAt(0).toUpperCase() + selectedShape.type.slice(1);
        pointsInfo.textContent = selectedShape.points.length;

        if (selectedShape.type === 'triangle') {
            const angles = calculateAngles(selectedShape);
            if (angles) {
                anglesInfo.textContent = `A: ${angles.A}°, B: ${angles.B}°, C: ${angles.C}°`;
                anglesRow.style.display = 'flex';
            }
        } else {
            anglesRow.style.display = 'none';
        }
    } else {
        selectedInfo.textContent = 'None';
        pointsInfo.textContent = shapes.reduce((sum, s) => sum + s.points.length, 0);
        anglesRow.style.display = 'none';
    }
}

shapesCanvas.addEventListener('mousedown', (e) => {
    const rect = shapesCanvas.getBoundingClientRect();
    const pos = getMousePos(e);
    const snappedPos = getSnappedPos(pos);

    // Right-click pan
    if (e.button === 2) {
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartOffsetX = offsetX;
        panStartOffsetY = offsetY;
        e.preventDefault();
        return;
    }

    if (currentShapeType) {
        if (currentShapeType === 'square' && currentShapePoints.length === 0) {
            currentShapePoints.push(snappedPos);
        } else if (currentShapeType === 'square' && currentShapePoints.length === 1) {
            const p1 = currentShapePoints[0];
            const size = Math.max(Math.abs(snappedPos.x - p1.x), Math.abs(snappedPos.y - p1.y));
            const dx = snappedPos.x >= p1.x ? size : -size;
            const dy = snappedPos.y >= p1.y ? size : -size;
            const points = [
                { x: p1.x, y: p1.y },
                { x: p1.x + dx, y: p1.y },
                { x: p1.x + dx, y: p1.y + dy },
                { x: p1.x, y: p1.y + dy }
            ];
            createShape('square', points);
            currentShapePoints = [];
            currentShapeType = null;
            document.querySelectorAll('[data-shape]').forEach(btn => btn.classList.remove('active'));
        } else if (currentShapeType === 'triangle') {
            currentShapePoints.push(snappedPos);
            if (currentShapePoints.length === 3) {
                createShape('triangle', currentShapePoints);
                currentShapePoints = [];
                currentShapeType = null;
                document.querySelectorAll('[data-shape]').forEach(btn => btn.classList.remove('active'));
            }
        } else if (currentShapeType === 'circle') {
            currentShapePoints.push(snappedPos);
            if (currentShapePoints.length === 2) {
                createShape('circle', currentShapePoints);
                currentShapePoints = [];
                currentShapeType = null;
                document.querySelectorAll('[data-shape]').forEach(btn => btn.classList.remove('active'));
            }
        }
        checkCollisions();
        drawAllShapes();
        return;
    }

    const pointFound = findPointAtPosition(pos);
    if (pointFound) {
        isDragging = true;
        dragPointIndex = pointFound.index;
        selectedShape = pointFound.shape;
        dragOffset = {
            x: pos.x - pointFound.point.x,
            y: pos.y - pointFound.point.y
        };
        updateInfoPanel();
        drawAllShapes();
        return;
    }

    const shapeFound = findShapeAtPosition(pos);
    if (shapeFound) {
        isDraggingShape = true;
        selectedShape = shapeFound;
        dragOffset = {
            x: pos.x - shapeFound.points[0].x,
            y: pos.y - shapeFound.points[0].y
        };
        updateInfoPanel();
        drawAllShapes();
    } else {
        selectedShape = null;
        updateInfoPanel();
        drawAllShapes();
    }
});

shapesCanvas.addEventListener('mousemove', (e) => {
    // Pan with right-click
    if (isPanning) {
        const deltaX = e.clientX - panStartX;
        const deltaY = e.clientY - panStartY;
        offsetX = panStartOffsetX + deltaX;
        offsetY = panStartOffsetY + deltaY;
        drawGrid();
        drawAllShapes();
        return;
    }

    const rect = shapesCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pos = screenToWorld(screenX, screenY);

    lastDragPos = pos;

    if ((isDragging && selectedShape && dragPointIndex >= 0) || (isDraggingShape && selectedShape)) {
        if (!isDragQueued) {
            isDragQueued = true;
            requestAnimationFrame(processDrag);
        }
        return;
    }

    const pointFound = findPointAtPosition(pos);
    if (pointFound) {
        hoveredPoint = pointFound.point;
        tooltip.textContent = `(${(pointFound.point.x / GRID_SIZE).toFixed(1)}, ${(pointFound.point.y / GRID_SIZE).toFixed(1)})`;
        tooltip.classList.add('visible');
        tooltip.style.left = (screenX + 15) + 'px';
        tooltip.style.top = (screenY + 15) + 'px';
        shapesCanvas.style.cursor = 'pointer';
        drawAllShapes();
    } else {
        if (hoveredPoint) {
            hoveredPoint = null;
            tooltip.classList.remove('visible');
            shapesCanvas.style.cursor = currentShapeType ? 'crosshair' : 'default';
            drawAllShapes();
        } else if (!tooltip.classList.contains('visible')) {
            shapesCanvas.style.cursor = currentShapeType ? 'crosshair' : 'default';
        }
    }
});

shapesCanvas.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        isPanning = false;
    }
    isDragging = false;
    dragPointIndex = -1;
    isDraggingShape = false;
});

shapesCanvas.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
    isPanning = false;
    isDragging = false;
    dragPointIndex = -1;
    isDraggingShape = false;
});

shapesCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
shapesCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
shapesCanvas.addEventListener('mousemove', (e) => {
    const rect = shapesCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pos = screenToWorld(screenX, screenY);
    const snappedPos = getSnappedPos(pos);

    if (isDragging && selectedShape && dragPointIndex >= 0) {
        // snap point in world coordinates
        selectedShape.points[dragPointIndex] = snappedPos;
        checkCollisions();
        updateInfoPanel();
        drawAllShapes();
        return;
    }

    if (isDraggingShape && selectedShape) {
        // move whole shape: compute new base (world) and snap that base
        const newBaseWorldX = pos.x - dragOffset.x;
        const newBaseWorldY = pos.y - dragOffset.y;
        const snappedBaseX = snapToGrid(newBaseWorldX);
        const snappedBaseY = snapToGrid(newBaseWorldY);

        const originalBase = selectedShape.points[0];
        const dx = snappedBaseX - originalBase.x;
        const dy = snappedBaseY - originalBase.y;

        selectedShape.points.forEach(point => {
            point.x += dx;
            point.y += dy;
        });

        // recompute dragOffset relative to moved shape
        dragOffset.x = pos.x - selectedShape.points[0].x;
        dragOffset.y = pos.y - selectedShape.points[0].y;

        checkCollisions();
        updateInfoPanel();
        drawAllShapes();
        return;
    }

    const pointFound = findPointAtPosition(pos);
    if (pointFound) {
        hoveredPoint = pointFound.point;
        // show coordinates in grid units with one decimal
        tooltip.textContent = `(${(pointFound.point.x / GRID_SIZE).toFixed(1)}, ${(pointFound.point.y / GRID_SIZE).toFixed(1)})`;
        tooltip.classList.add('visible');
        tooltip.style.left = (screenX + 15) + 'px';
        tooltip.style.top = (screenY + 15) + 'px';
        shapesCanvas.style.cursor = 'pointer';
        drawAllShapes();
    } else {
        if (hoveredPoint) {
            hoveredPoint = null;
            tooltip.classList.remove('visible');
            shapesCanvas.style.cursor = currentShapeType ? 'crosshair' : 'default';
            drawAllShapes();
        } else if (!tooltip.classList.contains('visible')) {
            shapesCanvas.style.cursor = currentShapeType ? 'crosshair' : 'default';
        }
    }
});

shapesCanvas.addEventListener('mouseup', () => {
    isDragging = false;
    dragPointIndex = -1;
    isDraggingShape = false;
});

shapesCanvas.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
    isDragging = false;
    dragPointIndex = -1;
    isDraggingShape = false;
});

document.querySelectorAll('[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));

        if (currentShapeType === btn.dataset.shape) {
            currentShapeType = null;
            currentShapePoints = [];
        } else {
            currentShapeType = btn.dataset.shape;
            currentShapePoints = [];
            btn.classList.add('active');
        }

        shapesCanvas.style.cursor = currentShapeType ? 'crosshair' : 'default';
        drawAllShapes();
    });
});

document.getElementById('rotateBtn').addEventListener('click', () => {
    if (selectedShape) {
        rotateShape(selectedShape);
        checkCollisions();
        drawAllShapes();
    }
});

document.getElementById('flipBtn').addEventListener('click', () => {
    if (selectedShape) {
        flipShapeHorizontal(selectedShape);
        checkCollisions();
        drawAllShapes();
    }
});

document.getElementById('flipVertBtn').addEventListener('click', () => {
    if (selectedShape) {
        flipShapeVertical(selectedShape);
        checkCollisions();
        drawAllShapes();
    }
});

document.getElementById('deleteBtn').addEventListener('click', () => {
    if (selectedShape) {
        shapes = shapes.filter(s => s !== selectedShape);
        selectedShape = null;
        checkCollisions();
        updateInfoPanel();
        drawAllShapes();
    }
});

document.getElementById('clearBtn').addEventListener('click', () => {
    shapes = [];
    selectedShape = null;
    currentShapeType = null;
    currentShapePoints = [];
    checkCollisions();
    updateInfoPanel();
    drawAllShapes();
});

createBtn.addEventListener('click', () => {
    const input = coordInput.value.trim();
    if (!input) return;

    const parts = input.split(/\s+/);
    const points = [];

    for (let part of parts) {
        const coords = part.split(',');
        if (coords.length === 2) {
            const x = parseFloat(coords[0]) * GRID_SIZE;
            const y = parseFloat(coords[1]) * GRID_SIZE;
            if (!isNaN(x) && !isNaN(y)) {
                points.push({ x, y });
            }
        }
    }

    if (points.length >= 2) {
        let type = 'polygon';
        if (points.length === 2) {
            type = 'circle';
        } else if (points.length === 3) {
            type = 'triangle';
        } else if (points.length === 4) {
            // if the 4 points form an axis-aligned square, mark as square
            const dx1 = Math.abs(points[0].x - points[1].x);
            const dy1 = Math.abs(points[0].y - points[1].y);
            const isAxisAlignedSquare = (dx1 === Math.abs(points[1].x - points[2].x) && dy1 === Math.abs(points[1].y - points[2].y));
            type = isAxisAlignedSquare ? 'square' : 'polygon';
        } else {
            type = 'polygon';
        }

        createShape(type, points);
        checkCollisions();
        updateInfoPanel();
        drawAllShapes();
        coordInput.value = '';
    }
});

showAxesToggle.addEventListener('change', (e) => {
    showAxesNumbers = e.target.checked;
    drawGrid();
    drawAllShapes();
});

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedShape) {
            shapes = shapes.filter(s => s !== selectedShape);
            selectedShape = null;
            checkCollisions();
            updateInfoPanel();
            drawAllShapes();
        }
    }
    if (e.key === 'r' || e.key === 'R') {
        if (selectedShape) {
            rotateShape(selectedShape);
            checkCollisions();
            drawAllShapes();
        }
    }
    if (e.key === 'f' || e.key === 'F') {
        if (selectedShape) {
            flipShapeHorizontal(selectedShape);
            checkCollisions();
            drawAllShapes();
        }
    }
});
// ...existing code...

// Add zoom controls UI
const zoomControlsHTML = `
    <div class="zoom-controls">
        <button class="btn" id="zoomInBtn" title="Zoom In (+)">
            <svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="18" font-weight="bold" fill="currentColor">+</text></svg>
        </button>
        <button class="btn" id="zoomOutBtn" title="Zoom Out (-)">
            <svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="18" font-weight="bold" fill="currentColor">−</text></svg>
        </button>
        <button class="btn" id="resetViewBtn" title="Reset View">
            <svg viewBox="0 0 24 24"><path d="M 4 12 A 8 8 0 0 1 20 12 M 18 10 L 20 12 L 18 14" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
    </div>
`;

document.body.insertAdjacentHTML('beforeend', zoomControlsHTML);

// Add CSS for zoom controls
const zoomControlsStyle = document.createElement('style');
zoomControlsStyle.textContent = `
    .zoom-controls {
        position: fixed;
        right: 20px;
        top: 100px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 100;
    }

    .zoom-controls .btn {
        width: 40px;
        height: 40px;
    }

    .zoom-controls svg {
        width: 20px;
        height: 20px;
    }
`;
document.head.appendChild(zoomControlsStyle);

// Zoom function
function setZoom(newScale) {
    const clampedScale = Math.min(5, Math.max(0.2, newScale));
    scale = clampedScale;
    
    // center view on canvas center
    const centerScreenX = shapesCanvas.width / 2;
    const centerScreenY = shapesCanvas.height / 2;
    offsetX = centerScreenX;
    offsetY = centerScreenY;
    
    drawGrid();
    drawAllShapes();
}

// Zoom button handlers
document.getElementById('zoomInBtn').addEventListener('click', () => {
    setZoom(scale * 1.2);
});

document.getElementById('zoomOutBtn').addEventListener('click', () => {
    setZoom(scale / 1.2);
});

document.getElementById('resetViewBtn').addEventListener('click', () => {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    drawGrid();
    drawAllShapes();
});

// Smooth drag: use requestAnimationFrame for smoother movement
let lastDragPos = { x: 0, y: 0 };
let isDragQueued = false;

function processDrag() {
    isDragQueued = false;
    
    if (isDragging && selectedShape && dragPointIndex >= 0) {
        const snappedPos = getSnappedPos(lastDragPos);
        selectedShape.points[dragPointIndex] = snappedPos;
        checkCollisions();
        updateInfoPanel();
        drawAllShapes();
    } else if (isDraggingShape && selectedShape) {
        const snappedBaseX = snapToGrid(lastDragPos.x - dragOffset.x);
        const snappedBaseY = snapToGrid(lastDragPos.y - dragOffset.y);

        const originalBase = selectedShape.points[0];
        const dx = snappedBaseX - originalBase.x;
        const dy = snappedBaseY - originalBase.y;

        if (dx !== 0 || dy !== 0) {
            selectedShape.points.forEach(point => {
                point.x += dx;
                point.y += dy;
            });

            dragOffset.x = lastDragPos.x - selectedShape.points[0].x;
            dragOffset.y = lastDragPos.y - selectedShape.points[0].y;

            checkCollisions();
            updateInfoPanel();
            drawAllShapes();
        }
    }
}
createBtn.addEventListener('click', () => {
    const input = coordInput.value.trim();
    if (!input) return;

    const parts = input.split(/\s+/);
    const points = [];

    for (let part of parts) {
        const coords = part.split(',');
        if (coords.length === 2) {
            const x = parseFloat(coords[0]) * GRID_SIZE;
            const y = parseFloat(coords[1]) * GRID_SIZE;
            if (!isNaN(x) && !isNaN(y)) {
                points.push({ x, y });
            }
        }
    }

    // Allow creating with as few as 2 points
    if (points.length >= 2) {
        let type = 'polygon';
        
        if (points.length === 2) {
            type = 'circle';
        } else if (points.length === 3) {
            type = 'triangle';
        } else if (points.length === 4) {
            // check if it's an axis-aligned square
            const dx1 = Math.abs(points[0].x - points[1].x);
            const dy1 = Math.abs(points[0].y - points[1].y);
            const dx2 = Math.abs(points[1].x - points[2].x);
            const dy2 = Math.abs(points[1].y - points[2].y);
            const isAxisAlignedSquare = (dx1 === dx2 && dy1 === dy2);
            type = isAxisAlignedSquare ? 'square' : 'polygon';
        } else {
            type = 'polygon';
        }

        createShape(type, points);
        checkCollisions();
        updateInfoPanel();
        drawAllShapes();
        coordInput.value = '';
    } else if (points.length === 1) {
        // show error or just ignore
        console.warn('Need at least 2 coordinate pairs');
    }
});
shapesCanvas.addEventListener('mousemove', (e) => {
    const rect = shapesCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pos = screenToWorld(screenX, screenY);

    lastDragPos = pos;

    if ((isDragging && selectedShape && dragPointIndex >= 0) || (isDraggingShape && selectedShape)) {
        if (!isDragQueued) {
            isDragQueued = true;
            requestAnimationFrame(processDrag);
        }
        return;
    }

    const pointFound = findPointAtPosition(pos);
    if (pointFound) {
        hoveredPoint = pointFound.point;
        tooltip.textContent = `(${(pointFound.point.x / GRID_SIZE).toFixed(1)}, ${(pointFound.point.y / GRID_SIZE).toFixed(1)})`;
        tooltip.classList.add('visible');
        tooltip.style.left = (screenX + 15) + 'px';
        tooltip.style.top = (screenY + 15) + 'px';
        shapesCanvas.style.cursor = 'pointer';
        drawAllShapes();
    } else {
        if (hoveredPoint) {
            hoveredPoint = null;
            tooltip.classList.remove('visible');
            shapesCanvas.style.cursor = currentShapeType ? 'crosshair' : 'default';
            drawAllShapes();
        } else if (!tooltip.classList.contains('visible')) {
            shapesCanvas.style.cursor = currentShapeType ? 'crosshair' : 'default';
        }
    }
});

// ...existing code...
// zoom handling: wheel to zoom centered at mouse
shapesCanvas.addEventListener('wheel', (e) => {
    const rect = shapesCanvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldBefore = screenToWorld(screenX, screenY);

    // zoom factor per wheel event (smooth)
    const delta = -e.deltaY;
    const zoomFactor = delta > 0 ? 1.1 : 0.9;

    const newScale = Math.min(5, Math.max(0.2, scale * zoomFactor));
    scale = newScale;

    // keep the worldBefore point under the mouse after zoom
    offsetX = screenX - worldBefore.x * scale;
    offsetY = screenY - worldBefore.y * scale;

    e.preventDefault();
    drawGrid();
    drawAllShapes();
}, { passive: false });

window.addEventListener('resize', resizeCanvases);

resizeCanvases();
drawGrid();
// ...existing code...