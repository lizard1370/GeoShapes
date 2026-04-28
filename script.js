const GRID_SIZE = 20;
const SNAP_THRESHOLD = 10;
const POINT_RADIUS = 6;

const gridCanvas = document.getElementById('gridCanvas');
const shapesCanvas = document.getElementById('shapesCanvas');
const gridCtx = gridCanvas.getContext('2d');
const shapesCtx = shapesCanvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const selectedInfo = document.getElementById('selectedInfo');
const pointsInfo = document.getElementById('pointsInfo');

let shapes = [];
let selectedShape = null;
let currentShapeType = null;
let currentShapePoints = [];
let isDragging = false;
let dragPointIndex = -1;
let isDraggingShape = false;
let dragOffset = { x: 0, y: 0 };
let hoveredPoint = null;

function resizeCanvases() {
    gridCanvas.width = window.innerWidth;
    gridCanvas.height = window.innerHeight;
    shapesCanvas.width = window.innerWidth;
    shapesCanvas.height = window.innerHeight;
    drawGrid();
    drawAllShapes();
}

function drawGrid() {
    gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    gridCtx.strokeStyle = '#e2e8f0';
    gridCtx.lineWidth = 1;

    for (let x = 0; x <= gridCanvas.width; x += GRID_SIZE) {
        gridCtx.beginPath();
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, gridCanvas.height);
        gridCtx.stroke();
    }

    for (let y = 0; y <= gridCanvas.height; y += GRID_SIZE) {
        gridCtx.beginPath();
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(gridCanvas.width, y);
        gridCtx.stroke();
    }

    gridCtx.strokeStyle = '#cbd5e1';
    gridCtx.lineWidth = 2;
    for (let x = 0; x <= gridCanvas.width; x += GRID_SIZE * 5) {
        gridCtx.beginPath();
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, gridCanvas.height);
        gridCtx.stroke();
    }
    for (let y = 0; y <= gridCanvas.height; y += GRID_SIZE * 5) {
        gridCtx.beginPath();
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(gridCanvas.width, y);
        gridCtx.stroke();
    }
}

function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function getMousePos(e) {
    const rect = shapesCanvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
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
        default: return '#2563eb';
    }
}

function drawShape(shape) {
    const ctx = shapesCtx;
    const isSelected = shape === selectedShape;
    const isCollision = shape.collision;

    ctx.beginPath();
    if (shape.points.length > 0) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        if (shape.type === 'circle' && shape.points.length >= 2) {
            const center = shape.points[0];
            const radius = Math.sqrt(
                Math.pow(shape.points[1].x - center.x, 2) +
                Math.pow(shape.points[1].y - center.y, 2)
            );
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        } else {
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

    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.fill();
    ctx.stroke();

    shape.points.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = isSelected || hoveredPoint === point ? shape.color : 'white';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    });
}

function drawAllShapes() {
    shapesCtx.clearRect(0, 0, shapesCanvas.width, shapesCanvas.height);
    shapes.forEach(shape => drawShape(shape));

    if (currentShapePoints.length > 0) {
        drawPreviewShape();
    }
}

function drawPreviewShape() {
    const ctx = shapesCtx;
    ctx.beginPath();
    ctx.moveTo(currentShapePoints[0].x, currentShapePoints[0].y);
    for (let i = 1; i < currentShapePoints.length; i++) {
        ctx.lineTo(currentShapePoints[i].x, currentShapePoints[i].y);
    }
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    currentShapePoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
    });
}

function findPointAtPosition(pos) {
    for (let shape of shapes) {
        for (let i = 0; i < shape.points.length; i++) {
            const point = shape.points[i];
            const dist = Math.sqrt(Math.pow(pos.x - point.x, 2) + Math.pow(pos.y - point.y, 2));
            if (dist < POINT_RADIUS * 2) {
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
    } else {
        selectedInfo.textContent = 'None';
        pointsInfo.textContent = shapes.reduce((sum, s) => sum + s.points.length, 0);
    }
}

shapesCanvas.addEventListener('mousedown', (e) => {
    const pos = getMousePos(e);
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
});

shapesCanvas.addEventListener('mousemove', (e) => {
    const pos = getMousePos(e);
    const snappedPos = getSnappedPos(pos);

    if (isDragging && selectedShape && dragPointIndex >= 0) {
        selectedShape.points[dragPointIndex] = snappedPos;
        checkCollisions();
        drawAllShapes();
        return;
    }

    if (isDraggingShape && selectedShape) {
        const newBaseX = pos.x - dragOffset.x;
        const newBaseY = pos.y - dragOffset.y;
        const snappedBaseX = snapToGrid(newBaseX);
        const snappedBaseY = snapToGrid(newBaseY);

        const originalBase = selectedShape.points[0];
        const dx = snappedBaseX - originalBase.x;
        const dy = snappedBaseY - originalBase.y;

        selectedShape.points.forEach(point => {
            point.x += dx;
            point.y += dy;
        });

        dragOffset.x = pos.x - selectedShape.points[0].x;
        dragOffset.y = pos.y - selectedShape.points[0].y;

        checkCollisions();
        drawAllShapes();
        return;
    }

    const pointFound = findPointAtPosition(pos);
    if (pointFound) {
        hoveredPoint = pointFound.point;
        tooltip.textContent = `(${pointFound.point.x / GRID_SIZE}, ${pointFound.point.y / GRID_SIZE})`;
        tooltip.classList.add('visible');
        tooltip.style.left = (pos.x + 15) + 'px';
        tooltip.style.top = (pos.y + 15) + 'px';
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

window.addEventListener('resize', resizeCanvases);

resizeCanvases();
drawGrid();
