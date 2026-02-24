module.exports = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          // Disable the default color conversion to keep your multi-color icon safe
          convertColors: {
            shortnames: false,
          },
          // We don't disable removeViewBox here anymore; we do it below
        },
      },
    },
    // Explicitly disable removeViewBox by passing its name with active: false
    {
      name: 'removeViewBox',
      active: false,
    },
    'sortAttrs',
    'convertStyleToAttrs',
    'prefixIds',
  ],
};
