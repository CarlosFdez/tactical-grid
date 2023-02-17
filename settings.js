import { GRID_MASK } from './tactical-grid.js';

// Config
export const MODULE_CONFIG = {
  defaultViewLength: 4,
  defaultViewShape: 'circle-soft',
  controlled: true,
  hover: true,
  enableInCombatOnly: false,
};

export const EMBEDS_AND_LAYERS = [
  ['Token', 'TokenLayer'],
  ['MeasuredTemplate', 'TemplateLayer'],
  ['Tile', 'TilesLayer'],
  ['Drawing', 'DrawingsLayer'],
  ['Wall', 'WallsLayer'],
  ['AmbientLight', 'LightingLayer'],
  ['AmbientSound', 'SoundsLayer'],
  ['Note', 'NotesLayer'],
];

export function init() {
  if (typeof libWrapper === 'function') {
    libWrapper.register(
      'aedifs-tactical-grid',
      'Ruler.prototype._onDragStart',
      function (wrapped, ...args) {
        let result = wrapped(...args);
        GRID_MASK.container.drawMask();
        return result;
      },
      'WRAPPER'
    );

    libWrapper.register(
      'aedifs-tactical-grid',
      'Ruler.prototype._endMeasurement',
      function (wrapped, ...args) {
        let result = wrapped(...args);
        GRID_MASK.container.drawMask();
        return result;
      },
      'WRAPPER'
    );

    libWrapper.register(
      'aedifs-tactical-grid',
      'Ruler.prototype._onMouseMove',
      function (wrapped, ...args) {
        let result = wrapped(...args);
        GRID_MASK.container.setGridMaskPosition(this);
        return result;
      },
      'WRAPPER'
    );
  }

  game.settings.register('aedifs-tactical-grid', 'enableForControlled', {
    name: game.i18n.localize('aedifs-tactical-grid.settings.enableForControlled.name'),
    hint: game.i18n.localize('aedifs-tactical-grid.settings.enableForControlled.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: MODULE_CONFIG.controlled,
    onChange: async (val) => {
      MODULE_CONFIG.controlled = val;
      GRID_MASK.container.drawMask();
    },
  });
  MODULE_CONFIG.controlled = game.settings.get('aedifs-tactical-grid', 'enableForControlled');

  game.settings.register('aedifs-tactical-grid', 'enableForHover', {
    name: game.i18n.localize('aedifs-tactical-grid.settings.enableForHover.name'),
    hint: game.i18n.localize('aedifs-tactical-grid.settings.enableForHover.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: MODULE_CONFIG.hover,
    onChange: async (val) => {
      MODULE_CONFIG.hover = val;
      GRID_MASK.container.drawMask();
    },
  });
  MODULE_CONFIG.hover = game.settings.get('aedifs-tactical-grid', 'enableForHover');

  game.settings.register('aedifs-tactical-grid', 'tacticalGridCombatOnly', {
    name: game.i18n.localize('aedifs-tactical-grid.settings.tacticalGridCombatOnly.name'),
    hint: game.i18n.localize('aedifs-tactical-grid.settings.tacticalGridCombatOnly.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: MODULE_CONFIG.enableInCombatOnly,
    onChange: async (val) => {
      MODULE_CONFIG.enableInCombatOnly = val;
      GRID_MASK.container.drawMask();
    },
  });
  MODULE_CONFIG.enableInCombatOnly = game.settings.get(
    'aedifs-tactical-grid',
    'tacticalGridCombatOnly'
  );

  game.settings.register('aedifs-tactical-grid', 'tacticalGridCombatOnly', {
    name: game.i18n.localize('aedifs-tactical-grid.settings.tacticalGridCombatOnly.name'),
    hint: game.i18n.localize('aedifs-tactical-grid.settings.tacticalGridCombatOnly.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: MODULE_CONFIG.enableInCombatOnly,
    onChange: async (val) => {
      MODULE_CONFIG.enableInCombatOnly = val;
      GRID_MASK.container.drawMask();
    },
  });
  MODULE_CONFIG.enableInCombatOnly = game.settings.get(
    'aedifs-tactical-grid',
    'tacticalGridCombatOnly'
  );

  game.settings.register('aedifs-tactical-grid', 'defaultViewDistance', {
    name: game.i18n.localize('aedifs-tactical-grid.settings.defaultViewDistance.name'),
    hint: game.i18n.localize('aedifs-tactical-grid.settings.defaultViewDistance.hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: MODULE_CONFIG.defaultViewLength,
    onChange: async (val) => {
      MODULE_CONFIG.defaultViewLength = val ? val : 0;
    },
  });
  MODULE_CONFIG.defaultViewLength = game.settings.get(
    'aedifs-tactical-grid',
    'defaultViewDistance'
  );

  let shapeOptions = {
    circle: 'Circle',
    'circle-soft': 'Circle (Soft)',
    square: 'Square',
    'square-soft': 'Square (Soft)',
    hexagonRow: 'Hexagon (Row)',
    hexagonCol: 'Hexagon (Column)',
  };

  game.settings.register('aedifs-tactical-grid', 'defaultViewShape', {
    name: game.i18n.localize('aedifs-tactical-grid.settings.defaultViewShape.name'),
    hint: game.i18n.localize('aedifs-tactical-grid.settings.defaultViewShape.hint'),
    scope: 'world',
    config: true,
    type: String,
    default: MODULE_CONFIG.defaultViewShape,
    choices: shapeOptions,
    onChange: async (val) => {
      MODULE_CONFIG.defaultViewShape = val;
    },
  });
  MODULE_CONFIG.defaultViewShape = game.settings.get('aedifs-tactical-grid', 'defaultViewShape');

  for (const [embedName, layerName] of EMBEDS_AND_LAYERS) {
    const settingName = `${layerName}Enabled`;
    game.settings.register('aedifs-tactical-grid', settingName, {
      name: embedName + ' Layer',
      hint: `Enable tactical grid for \"${embedName} Layer\"`,
      scope: 'world',
      config: true,
      type: Boolean,
      default: embedName === 'Token',
      onChange: async (val) => {
        MODULE_CONFIG[settingName] = val;
        if (canvas.activeLayer.name === layerName) {
          if (MODULE_CONFIG[settingName]) {
            GRID_MASK.container.activateMask();
          } else {
            GRID_MASK.container.deactivateMask();
          }
        }
      },
    });
    MODULE_CONFIG[settingName] = game.settings.get('aedifs-tactical-grid', settingName);
  }

  game.keybindings.register('aedifs-tactical-grid', 'toggleGrid', {
    name: game.i18n.localize('aedifs-tactical-grid.keybindings.toggleGrid.name'),
    hint: game.i18n.localize('aedifs-tactical-grid.keybindings.toggleGrid.hint'),
    editable: [],
    onDown: () => {
      try {
        let val = game.settings.get('aedifs-tactical-grid', `${canvas.activeLayer.name}Enabled`);
        game.settings.set('aedifs-tactical-grid', `${canvas.activeLayer.name}Enabled`, !val);
      } catch (e) {
        GRID_MASK.container.deactivateMask();
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  /** =======================================================
   *  Insert token specific viewDistance and viewShape flags
   *  =======================================================
   */
  Hooks.on('renderTokenConfig', (tokenConfig) => {
    const viewDistance = tokenConfig.object.getFlag('aedifs-tactical-grid', 'viewDistance') ?? '';
    const viewShape = tokenConfig.object.getFlag('aedifs-tactical-grid', 'viewShape') ?? '';

    let options = '<option value=""></option>';
    for (const [k, v] of Object.entries(shapeOptions)) {
      options += `<option value="${k}" ${viewShape === k ? 'selected' : ''}>${v}</option>`;
    }

    const control = $(`
  <fieldset>
    <legend>Tactical Grid</legend>
    <div class="form-group slim">
      <label>View Distance <span class="units">(Grid spaces)</span></label>
      <div class="form-fields">
        <input type="number" value="${viewDistance}" step="any" name="flags.aedifs-tactical-grid.viewDistance">
      </div>
      <p class="notes">${game.i18n.localize(
        'aedifs-tactical-grid.settings.defaultViewDistance.hint'
      )}</p>
    </div>
    <div class="form-group">
      <label>View Shape</label>
      <div class="form-fields">
          <select name="flags.aedifs-tactical-grid.viewShape">
            ${options}
          </select>
      </div>
      <p class="hint">${game.i18n.localize(
        'aedifs-tactical-grid.settings.defaultViewShape.hint'
      )}</p>
      </div>
  </fieldset>
    `);

    $(tokenConfig.form).find('[name="sight.visionMode"]').closest('.form-group').after(control);
    tokenConfig.setPosition({ height: 'auto' });
  });
}
