const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const sourcePath = path.resolve(__dirname, 'src/main/assets/js');
const govukFrontend = require(path.resolve(__dirname, 'webpack/govukFrontend'));
const scss = require(path.resolve(__dirname, 'webpack/scss'));
const HtmlWebpack = require(path.resolve(__dirname, 'webpack/htmlWebpack'));

const govukMacrosPath = path.dirname(require.resolve('govuk-frontend/dist/govuk/macros/attributes.njk'));

const devMode = process.env.NODE_ENV !== 'production';
const fileNameSuffix = devMode ? '-dev' : '.[contenthash]';
const filename = `[name]${fileNameSuffix}.js`;

module.exports = {
  plugins: [
    ...govukFrontend.plugins,
    ...scss.plugins,
    ...HtmlWebpack.plugins,
    new CopyWebpackPlugin({
      patterns: [
        {
          from: govukMacrosPath,
          to: path.resolve(__dirname, 'src/main/views/govuk/macros'),
        },
        {
          from: path.resolve(__dirname, 'src/main/assets/images'), // Source folder for images
          to: path.resolve(__dirname, 'src/main/public/assets/images'), // Emit to assets/images
        },
      ],
    }),
  ],
  entry: {
    main: path.resolve(sourcePath, 'index.ts'),
    chat: path.resolve(sourcePath, 'chat.ts'),
    showPassword: path.resolve(sourcePath, 'show-password.ts'),
    passwordValidationRegister: path.resolve(sourcePath, 'password-validation-register.ts'),
    passwordValidationAccount: path.resolve(sourcePath, 'password-validation-account.ts'),
    dateOfBirthValidation: path.resolve(sourcePath, 'date-of-birth-validation.ts'),
    emailValidation: path.resolve(sourcePath, 'email-validation.ts'),
    otpValidation: path.resolve(sourcePath, 'otp-validation.ts'),
    logout: path.resolve(sourcePath, 'logout.ts'),
  },
  mode: devMode ? 'development' : 'production',
  devtool: devMode ? 'inline-source-map' : false, // Avoid 'eval' in source maps
  module: {
    rules: [
      ...scss.rules,
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i, // Match image files
        type: 'asset/resource', // Webpack 5 asset/resource handling
        generator: {
          filename: 'assets/images/[name][ext]', // Emit to assets/images/ folder
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'src/main/public/'),
    publicPath: '/', // Serve assets from the root URL
    filename, // Dynamic filename based on entry point
  },
};
