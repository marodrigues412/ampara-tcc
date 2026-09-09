// Ampara uses React Navigation directly instead of Expo Router.
process.env.EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK = '1'

const { getDefaultConfig } = require('expo/metro-config')

module.exports = getDefaultConfig(__dirname)
