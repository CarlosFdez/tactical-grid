import { MODULE_CLIENT_CONFIG, MODULE_CONFIG } from '../applications/settings.js';
import {
  computeCoverBonus,
  nearestPointToCircle,
  nearestPointToRectangle,
  tokenHasEffect,
} from './utils.js';

export let TEXT_STYLE;

export class DistanceMeasurer {
  static hlName = 'ATG';
  //static shape;
  static gridSpaces = true;
  static snap = true;
  static origin;
  static originToken;
  static clone = null;
  static keyPressed = false;

  /**
   * Measure and display distances
   * @param {Boolean} options.gridSpaces should measurements be in grade space increments
   * @param {Boolean} options.snap should origin snap to grid
   */
  static showMeasures({ gridSpaces = true } = {}) {
    // if (!game.combat?.started) return;
    DistanceMeasurer.gridSpaces = gridSpaces;
    DistanceMeasurer.snap =
      canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS &&
      !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    if (!canvas.grid.highlightLayers[DistanceMeasurer.hlName]) {
      canvas.grid.addHighlightLayer(DistanceMeasurer.hlName);
    }
    DistanceMeasurer.setOrigin();
    DistanceMeasurer.drawLabels();
  }

  static hideMeasures() {
    DistanceMeasurer.deleteLabels();
    DistanceMeasurer.origin = null;
    DistanceMeasurer.originToken = null;
    canvas.grid.destroyHighlightLayer(DistanceMeasurer.hlName);
  }

  static _tokenAtRulerOrigin(ruler) {
    const rOrigin = ruler.waypoints[0];
    const token = canvas.tokens.controlled.find(
      (t) =>
        Number.between(rOrigin.x, t.x, t.x + t.hitArea.width) &&
        Number.between(rOrigin.y, t.y, t.y + t.hitArea.height)
    );

    if (token) {
      const destination = { ...ruler.destination };
      destination.x -= token.w / 2;
      destination.y -= token.h / 2;
      const clone = this.getClone(token, this.snap, destination);
      return clone;
    }
    return null;
  }

  static setOrigin(pos = null) {
    let origin;
    let originToken = null;
    let highlight = true;

    // If a ruler is active we will not use a token as origin
    // unless the token has a preview implying it is being dragged
    // together with the ruler (e.g. `Drag Ruler` module)
    const ruler = canvas.controls.ruler;
    let rulerMeasurement = false;

    // If there are no token previews and the ruler is active we may may pickup the token at ruler origin
    if (
      !canvas.tokens.preview.children.length &&
      ruler &&
      ruler._state !== Ruler.STATES.INACTIVE &&
      (MODULE_CLIENT_CONFIG.rulerActivatedDistanceMeasure ||
        MODULE_CLIENT_CONFIG.tokenActivatedDistanceMeasure ||
        DistanceMeasurer.keyPressed)
    ) {
      rulerMeasurement = true;
      originToken = DistanceMeasurer._tokenAtRulerOrigin(ruler);

      if (!originToken) {
        origin = deepClone(ruler.destination);
      }
    }

    if (!rulerMeasurement) {
      // Check if a token is being hovered over or controlled to use it as origin
      if (canvas.tokens.hover?.transform) {
        originToken = canvas.tokens.hover;
      } else if (canvas.tokens.controlled.length === 1) {
        originToken = canvas.tokens.controlled[0];
      }

      if (originToken) {
        if (originToken.hasPreview || pos) {
          if (!pos) originToken = originToken._preview;
          originToken = this.getClone(originToken, this.snap, pos);
          highlight = Boolean(pos);
        }
      }
    }

    // 'Elevation Ruler' module support
    // https://foundryvtt.com/packages/elevationruler
    if (
      originToken &&
      ruler?._state !== Ruler.STATES.INACTIVE &&
      ruler.destination._userElevationIncrements != null
    ) {
      originToken.document.elevation +=
        ruler.destination._userElevationIncrements * canvas.dimensions.distance;
    }

    if (pos) origin = pos;

    if (originToken) {
      if (highlight) DistanceMeasurer.highlightTokenGridPosition(originToken);
    } else if (origin) {
      const [x, y] = canvas.grid.grid.getTopLeft(origin.x, origin.y);
      origin.x = x + canvas.grid.size / 2;
      origin.y = y + canvas.grid.size / 2;
      if (highlight) {
        DistanceMeasurer.highlightPosition(x, y);
      }
    }

    DistanceMeasurer.origin = origin;
    DistanceMeasurer.originToken = originToken;
  }

  static clearHighlight() {
    canvas.grid.clearHighlightLayer(DistanceMeasurer.hlName);
  }

  static highlightTokenGridPosition(token) {
    DistanceMeasurer.clearHighlight();
    const layer = canvas.grid.highlightLayers[DistanceMeasurer.hlName];
    if (!layer) return;

    let shape;
    if (
      MODULE_CONFIG.measurement.gridlessCircle &&
      canvas.grid.type === CONST.GRID_TYPES.GRIDLESS
    ) {
      shape = new PIXI.Ellipse(token.center.x, token.center.y, token.w / 2, token.h / 2);
    } else {
      shape = new PIXI.Rectangle(token.x, token.y, token.w, token.h);
    }

    if (Number.isFinite(MODULE_CONFIG.marker.color))
      layer.beginFill(MODULE_CONFIG.marker.color, MODULE_CONFIG.marker.alpha);
    if (Number.isFinite(MODULE_CONFIG.marker.border))
      layer.lineStyle(2, MODULE_CONFIG.marker.color, MODULE_CONFIG.marker.alpha);
    else layer.lineStyle(0);
    layer.drawShape(shape).endFill();
  }

  static highlightPosition(x, y) {
    DistanceMeasurer.clearHighlight();
    const layer = canvas.grid.highlightLayers[DistanceMeasurer.hlName];
    if (!layer) return;

    let options = {
      x,
      y,
      ...MODULE_CONFIG.marker,
    };

    if (!(canvas.grid.grid instanceof SquareGrid || canvas.grid.grid instanceof HexagonalGrid)) {
      let r = 20;
      let points = [];
      CROSS_HAIR.forEach((p) => points.push(x + p[0] * r, y + p[1] * r));
      options.shape = new PIXI.Polygon(points);
    }

    canvas.grid.grid.highlightGridPosition(layer, options);
  }

  static drawLabels() {
    DistanceMeasurer.deleteLabels();
    if (!(DistanceMeasurer.origin || DistanceMeasurer.originToken)) return;

    let visibleTokens = canvas.tokens.placeables.filter(
      (p) => p.visible || p.impreciseVisible // Vision5e support
    );

    if (MODULE_CONFIG.measurement.ignoreEffect) {
      visibleTokens = visibleTokens.filter(
        (p) => !tokenHasEffect(p, MODULE_CONFIG.measurement.ignoreEffect)
      );
    }

    for (const token of visibleTokens) {
      let fromPoint;

      // If we have an originToken we should do measurements not from a point but a rectangle the size of the token
      // and thus find the closest point/grid space between the dragged and measured to token
      if (DistanceMeasurer.originToken) {
        fromPoint = nearestOriginPoint(DistanceMeasurer.originToken, token);
      } else {
        fromPoint = { ...DistanceMeasurer.origin };
      }

      const distances = [];

      if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
        // Gridless
        let target = {
          ...token.center,
        };

        const b = token.bounds;
        if (MODULE_CONFIG.measurement.gridlessCircle) {
          target = nearestPointToCircle(
            { ...token.center, r: Math.min(b.width, b.height) / 2 },
            fromPoint
          );
        } else {
          target = nearestPointToRectangle(
            {
              minX: b.x,
              minY: b.y,
              maxX: b.x + b.width,
              maxY: b.y + b.height,
            },
            fromPoint
          );
        }

        const distance = DistanceMeasurer.getDistance(fromPoint, target, token, {
          originToken: DistanceMeasurer.originToken,
          gridSpaces: false,
        });
        distances.push({ offsetX: token.w / 2, offsetY: token.h / 2, distance });
      } else if (
        canvas.grid.type !== CONST.GRID_TYPES.SQUARE &&
        token.document.width == token.document.height
      ) {
        // Hexagonal Grid
        const offsets = getHexOffsets(token);
        if (offsets) {
          for (const offset of offsets) {
            const offsetX = token.w * offset[0];
            const offsetY = token.h * offset[1];
            const target = {
              x: token.x + offsetX,
              y: token.y + offsetY,
            };
            const distance = DistanceMeasurer.getDistance(fromPoint, target, token, {
              gridSpaces: DistanceMeasurer.gridSpaces,
              originToken: DistanceMeasurer.originToken,
            });
            distances.push({ offsetX, offsetY, distance });
          }
        }
      }

      // Square Grid or fallback
      if (!distances.length) {
        for (let h = 0; h < token.h / canvas.grid.size; h++) {
          for (let w = 0; w < token.w / canvas.grid.size; w++) {
            const offsetY = canvas.grid.size * h + canvas.grid.size / 2;
            const offsetX = canvas.grid.size * w + canvas.grid.size / 2;
            const target = {
              x: token.x + offsetX,
              y: token.y + offsetY,
            };
            const distance = DistanceMeasurer.getDistance(fromPoint, target, token, {
              gridSpaces: DistanceMeasurer.gridSpaces,
              originToken: DistanceMeasurer.originToken,
            });
            distances.push({ offsetX, offsetY, distance });
          }
        }
      }

      /// Calculate Cover
      let cover;
      if (DistanceMeasurer.originToken && MODULE_CONFIG.cover.calculator !== 'none') {
        if (DistanceMeasurer.originToken.id !== token.id) {
          let attacker = DistanceMeasurer.originToken;

          if (CONFIG.debug.atg) {
            const dg = canvas.controls.debug;
            dg.clear();
            dg.lineStyle(4, 0xff0000, 1).drawRect(attacker.x, attacker.y, attacker.w, attacker.h);
          }

          try {
            cover = computeCoverBonus(attacker, token);
          } catch (e) {
            console.error(e);
          }
        }
      }

      if (distances.length) {
        if (MODULE_CONFIG.measurement.shortestDistance) {
          const smallest = distances.reduce((d1, d2) => (d1.distance < d2.distance ? d1 : d2));
          DistanceMeasurer.addUpdateLabel(
            token,
            token.w / 2,
            token.h / 2,
            DistanceMeasurer.genLabel(smallest.distance),
            cover
          );
        } else {
          distances.forEach((d) => {
            DistanceMeasurer.addUpdateLabel(
              token,
              d.offsetX,
              d.offsetY,
              DistanceMeasurer.genLabel(d.distance),
              cover
            );
          });
        }
      }
    }
  }

  static getClone(token, snap = false, pos = null) {
    if (
      this.clone &&
      this.clone.id === token.id &&
      this.clone.w === token.w &&
      this.clone.h === token.h
    ) {
      //
    } else {
      // if (this.clone) this.clone.destroy();
      const cloneDoc = token.document.clone({}, { keepId: true });
      this.clone = new CONFIG.Token.objectClass(cloneDoc);
      this.clone.eventMode = 'none';
      cloneDoc._object = this.clone;
    }

    if (pos) {
      const [x, y] = canvas.grid.grid.getTopLeft(pos.x, pos.y);
      pos.x = x;
      pos.y = y;
    }

    if (!pos) pos = { x: token.x, y: token.y };
    if (snap) pos = canvas.grid.getSnappedPosition(pos.x, pos.y, canvas.tokens.gridPrecision);

    // Set position to original
    this.clone.document.x = pos.x;
    this.clone.document.y = pos.y;
    this.clone.x = pos.x;
    this.clone.y = pos.y;

    this.clone.document.elevation = token.document.elevation;

    return this.clone;
  }

  static addUpdateLabel(token, x, y, text, cover) {
    if (cover != null) {
      const labels = MODULE_CONFIG.cover;
      if (cover <= 0 && labels.noCover) text += `\n${labels.noCover}`;
      if (cover === 2 && labels.halfCover) text += `\n${labels.halfCover}`;
      if (cover === 5 && labels.threeQuartersCover) text += `\n${labels.threeQuartersCover}`;
      if (cover > 5 && labels.totalCover) text += `\n${labels.totalCover}`;
    }

    if (token._atgLabels) {
      for (const t of token._atgLabels) {
        if (t.atgX === x && t.atgY === y) {
          t.text = text;
          return;
        }
      }
    }

    if (!TEXT_STYLE) {
      TEXT_STYLE = PreciseText.getTextStyle({
        ...MODULE_CONFIG.measurement,
        fontFamily: [MODULE_CONFIG.measurement.fontFamily, 'fontAwesome'].join(','),
      });
    }

    // Scale Font Size to Grid Size if needed
    if (
      MODULE_CONFIG.measurement.enableFontScaling &&
      MODULE_CONFIG.measurement.baseGridSize &&
      MODULE_CONFIG.measurement.baseGridSize !== canvas.dimensions.size
    ) {
      TEXT_STYLE.fontSize =
        MODULE_CONFIG.measurement.fontSize *
        (canvas.dimensions.size / MODULE_CONFIG.measurement.baseGridSize);
    } else {
      TEXT_STYLE.fontSize = MODULE_CONFIG.measurement.fontSize;
    }

    let pText = new PreciseText(text, TEXT_STYLE);
    pText.anchor.set(0.5);

    // Apply to _impreciseMesh (Vision5e support) if it's visible
    if (token.impreciseVisible) {
      pText = canvas.tokens.addChild(pText);
      pText.x = token.x + x;
      pText.y = token.y + y;
    } else {
      pText = token.addChild(pText);
      pText.x = x;
      pText.y = y;
    }
    pText.atgX = x;
    pText.atgY = y;

    if (token._atgLabels) token._atgLabels.push(pText);
    else token._atgLabels = [pText];
  }

  static deleteLabels() {
    canvas.tokens.placeables.forEach((p) => {
      if (p._atgLabels) {
        p._atgLabels.forEach((t) => t.parent.removeChild(t)?.destroy());
        delete p._atgLabels;
      }
    });

    if (CONFIG.debug.atg) {
      canvas.controls.debug.clear();
    }
  }

  static clickLeft(pos) {
    if (canvas.grid.highlightLayers[DistanceMeasurer.hlName]) {
      DistanceMeasurer.setOrigin(pos);
      DistanceMeasurer.drawLabels();
    }
  }

  static getDistance(origin, target, targetToken, options) {
    let distance;
    // If the tokens have elevation we want to create a faux target coordinate in 2d space
    // so that we can then let foundry utils calculate the appropriate distance based on diagonal rules
    let originElevation = options.originToken ? options.originToken.document.elevation : 0;
    let verticalDistance =
      (canvas.grid.size / canvas.dimensions.distance) *
      Math.abs(targetToken.document.elevation - originElevation);
    if (!MODULE_CONFIG.measurement.includeElevation) verticalDistance = 0;
    if (verticalDistance != 0) {
      let dx = target.x - origin.x;
      let dy = target.y - origin.y;
      let mag = Math.max(Math.sqrt(dx * dx + dy * dy), 0.0000001);
      let angle = Math.atan(verticalDistance / mag);
      let length = mag / Math.cos(angle);

      let ray = Ray.fromAngle(0, 0, angle, length);
      const segments = [{ ray }];
      distance = canvas.grid.grid.measureDistances(segments, options)[0];
    } else {
      distance = canvas.grid.measureDistance(origin, target, options);
    }

    let precision = 10 ** MODULE_CONFIG.measurement.precision;
    let number = parseFloat(
      (Math.round(distance * precision) / precision).toFixed(MODULE_CONFIG.measurement.precision)
    );
    return number;
  }

  static genLabel(distance) {
    return `${distance} ${canvas.scene.grid.units}`;
  }

  static _getVerticalDistance() {
    // Alternative DMG Movement
    if (rule === '5105') {
      let nd10 = Math.floor(nDiagonal / 2) - Math.floor((nDiagonal - nd) / 2);
      let spaces = nd10 * 2 + (nd - nd10) + ns;
      return spaces * canvas.dimensions.distance;
    }

    // Euclidean Measurement
    else if (rule === 'EUCL') {
      return Math.round(Math.hypot(nx, ny) * canvas.scene.grid.distance);
    }

    // Standard PHB Movement
    else return (ns + nd) * canvas.scene.grid.distance;
  }
}

/**
 * Find the closest point on the origin token, to the target token
 * @param {Token} oToken origin token
 * @param {Token} tToken target token
 * @returns {x, y} closest grid space or border edge (gridless)
 */
function nearestOriginPoint(oToken, tToken) {
  const center = oToken.center;
  if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
    if (MODULE_CONFIG.measurement.gridlessCircle) {
      return nearestPointToCircle(
        { ...center, r: Math.min(oToken.w, oToken.h) / 2 },
        tToken.center
      );
    } else {
      return nearestPointToRectangle(
        {
          minX: center.x - oToken.w / 2,
          minY: center.y - oToken.h / 2,
          maxX: center.x + oToken.w / 2,
          maxY: center.y + oToken.h / 2,
        },
        tToken.center
      );
    }
  }

  let gridPoints = [];
  if (
    canvas.grid.type !== CONST.GRID_TYPES.SQUARE &&
    oToken.document.width == oToken.document.height
  ) {
    const offsets = getHexOffsets(oToken);
    if (offsets) {
      for (const offset of offsets) {
        gridPoints.push({
          x: center.x - oToken.w / 2 + oToken.w * offset[0],
          y: center.y - oToken.h / 2 + oToken.h * offset[1],
        });
      }
    }
  }

  if (!gridPoints.length) {
    for (let h = 0; h < oToken.h / canvas.grid.size; h++) {
      for (let w = 0; w < oToken.w / canvas.grid.size; w++) {
        gridPoints.push({
          x: center.x - oToken.w / 2 + canvas.grid.size * w + canvas.grid.size / 2,
          y: center.y - oToken.h / 2 + canvas.grid.size * h + canvas.grid.size / 2,
        });
      }
    }
  }

  // Find the grid point with the shortest distance to tToken
  if (!gridPoints.length) return center;

  const tCenter = tToken.center;
  let closest = gridPoints[0];
  let cDistance = approxDistance(closest, tCenter);
  for (let i = 1; i < gridPoints.length; i++) {
    let d = approxDistance(gridPoints[i], tCenter);
    if (d < cDistance) {
      closest = gridPoints[i];
      cDistance = d;
    }
  }
  return closest;
}

function approxDistance(p1, p2) {
  return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

// const CROSS_HAIR = [
//   [-0.1, 0.4],
//   [0.1, 0.4],
//   [0.1, 0.1],
//   [0.4, 0.1],
//   [0.4, -0.1],
//   [0.1, -0.1],
//   [0.1, -0.4],
//   [-0.1, -0.4],
//   [-0.1, -0.1],
//   [-0.4, -0.1],
//   [-0.4, 0.1],
//   [-0.1, 0.1],
// ];

const CROSS_HAIR = [
  [0.0, 0.2],
  [0.5, 0.7],
  [0.7, 0.5],
  [0.2, 0.0],
  [0.7, -0.5],
  [0.5, -0.7],
  [0.0, -0.2],
  [-0.5, -0.7],
  [-0.7, -0.5],
  [-0.2, 0.0],
  [-0.7, 0.5],
  [-0.5, 0.7],
];

const POINTY_HEX_OFFSETS = {
  0.5: [[0.5, 0.5]],
  1: [[0.5, 0.5]],
  2: [
    [0.5, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  3: [
    [2 / 6, 1 / 6],
    [4 / 6, 1 / 6],
    [1 / 6, 0.5],
    [0.5, 0.5],
    [5 / 6, 0.5],
    [2 / 6, 5 / 6],
    [4 / 6, 5 / 6],
  ],
  4: [
    [0.25, 0.125],
    [0.5, 0.125],
    [0.75, 0.125],
    [0.125, 0.375],
    [0.375, 0.375],
    [0.625, 0.375],
    [0.875, 0.375],
    [0.25, 0.625],
    [0.5, 0.625],
    [0.75, 0.625],
    [0.375, 0.875],
    [0.625, 0.875],
  ],
};

const FLAT_HEX_OFFSETS = {
  0.5: [[0.5, 0.5]],
  1: [[0.5, 0.5]],
  2: [
    [0.25, 0.5],
    [0.75, 0.25],
    [0.75, 0.75],
  ],
  3: [
    [0.5, 1 / 6],
    [1 / 6, 2 / 6],
    [5 / 6, 2 / 6],
    [0.5, 0.5],
    [1 / 6, 4 / 6],
    [5 / 6, 4 / 6],
    [0.5, 5 / 6],
  ],
  4: [
    [0.125, 0.25],
    [0.125, 0.5],
    [0.125, 0.75],

    [0.375, 0.125],
    [0.375, 0.375],
    [0.375, 0.625],
    [0.375, 0.875],

    [0.625, 0.25],
    [0.625, 0.5],
    [0.625, 0.75],

    [0.875, 0.375],
    [0.875, 0.625],
  ],
};

// =======================================
// "Hex token size support" module support
// =======================================

// Additional offsets for size 5 tokens
const OFFSET_EXTENSION = {
  FLAT: {
    5: [
      [0.1, 0.3],
      [0.1, 0.5],
      [0.1, 0.7],
      [0.3, 0.2],
      [0.3, 0.4],
      [0.3, 0.6],
      [0.3, 0.8],
      [0.5, 0.1],
      [0.5, 0.3],
      [0.5, 0.5],
      [0.5, 0.7],
      [0.5, 0.9],
      [0.7, 0.2],
      [0.7, 0.4],
      [0.7, 0.6],
      [0.7, 0.8],
      [0.9, 0.3],
      [0.9, 0.5],
      [0.9, 0.7],
    ],
  },
  POINTY: {
    5: [
      [0.3, 0.1],
      [0.5, 0.1],
      [0.7, 0.1],
      [0.2, 0.3],
      [0.4, 0.3],
      [0.6, 0.3],
      [0.8, 0.3],
      [0.1, 0.5],
      [0.3, 0.5],
      [0.5, 0.5],
      [0.7, 0.5],
      [0.9, 0.5],
      [0.2, 0.7],
      [0.4, 0.7],
      [0.6, 0.7],
      [0.8, 0.7],
      [0.3, 0.9],
      [0.5, 0.9],
      [0.7, 0.9],
    ],
  },
};

export function getHexOffsets(token) {
  let offsets = canvas.grid.grid.columnar ? FLAT_HEX_OFFSETS : POINTY_HEX_OFFSETS;

  if (!game.modules.get('hex-size-support')?.active) return offsets[token.document.width];

  // If "Hex token size support" module is active we need to extend the offsets to include size 5
  offsets = {
    ...offsets,
    ...(canvas.grid.grid.columnar ? OFFSET_EXTENSION.FLAT : OFFSET_EXTENSION.POINTY),
  };

  // Flip size 2 hexes
  offsets[2] = offsets[2].map((o) =>
    canvas.grid.grid.columnar ? [1 - o[0], o[1]] : [o[0], 1 - o[1]]
  );

  offsets = offsets[token.document.width];

  // We may need to flip the offsets based on whether alt orientation is enabled
  if (
    offsets &&
    !!(
      game.settings.get('hex-size-support', 'altOrientationDefault') ^
      (token.document.getFlag('hex-size-support', 'alternateOrientation') ?? false)
    )
  ) {
    if (canvas.grid.grid.columnar) return offsets.map((o) => [1 - o[0], o[1]]);
    else return offsets.map((o) => [o[0], 1 - o[1]]);
  }

  return offsets;
}
