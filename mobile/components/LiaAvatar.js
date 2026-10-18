import React, { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg'
import { APARENCIA_PADRAO_LIA, carregarAparenciaLia, observarAparenciaLia } from '../services/liaAppearance'
import { BRAIDS, HAIR_STYLES } from './liaHairStyles'

const AnimatedView = Animated.View
const portraitLayerStyle = { position: 'absolute', width: '100%', height: '100%', left: 0, top: 0 }
const COLORS = {
  background: '#F6F1E9',
  skin: '#C98B6B',
  hair: '#2A1D1A',
  blush: '#D9968F',
  blue: '#273963',
}
const EYE_COLOR = '#231816'

const ICONS = {
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  chat: 'M4 5h16v11H9l-5 4z',
  waves: 'M4 11v2M8 8v8M12 5v14M16 8v8M20 11v2',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM9.5 10a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  question: 'M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4M12 18h.01',
  alert: 'M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
}

const EYES = {
  open: (x) => `M${x - 6},190 a6,7 0 1,0 12,0 a6,7 0 1,0 -12,0`,
  happy: (x) => `M${x - 8},193 Q${x},182 ${x + 8},193`,
  calm: (x) => `M${x - 8},189 Q${x},196 ${x + 8},189`,
}
const BROWS = {
  normal: ['M161,168 Q175,160 189,165', 'M211,165 Q225,160 239,168'],
  raised: ['M161,162 Q175,154 189,159', 'M211,159 Q225,154 239,162'],
  concerned: ['M161,168 Q175,163 189,158', 'M211,158 Q225,163 239,168'],
  serious: ['M161,162 Q175,163 189,169', 'M211,169 Q225,163 239,162'],
}
const MOUTHS = {
  soft: { d: 'M186,231 Q200,243 214,231', fill: 'none', width: 4 },
  open: { d: 'M183,229 Q200,251 217,229 Q200,236 183,229 Z', fill: 'lip', width: 2 },
  big: { d: 'M180,227 Q200,257 220,227 Q200,234 180,227 Z', fill: 'lip', width: 2 },
  flat: { d: 'M191,236 Q200,239 209,236', fill: 'none', width: 4 },
  worried: { d: 'M189,240 Q200,233 211,240', fill: 'none', width: 4 },
}

const REACTIONS = {
  ociosa: { label: 'em espera', eyes: 'open', brows: 'normal', mouth: 'soft', body: 'breathe' },
  oi: { label: 'dando boas-vindas', eyes: 'open', brows: 'raised', mouth: 'open', body: 'breathe', head: 'wave', badge: 'sparkle', badgeColor: '#B5625A' },
  falando: { label: 'falando', eyes: 'open', brows: 'normal', mouth: 'soft', body: 'breathe', talk: true, badge: 'chat', badgeColor: COLORS.blue },
  ouvindo: { label: 'ouvindo', eyes: 'open', brows: 'raised', mouth: 'soft', body: 'breathe', head: 'nod', badge: 'waves', badgeColor: COLORS.blue },
  pensando: { label: 'pensando', eyes: 'open', brows: 'raised', mouth: 'flat', body: 'breathe', head: 'tilt', look: true, dots: true },
  feliz: { label: 'feliz', eyes: 'happy', brows: 'raised', mouth: 'big', body: 'bounce', badge: 'heart', badgeColor: '#B5625A' },
  trajeto: { label: 'trajeto iniciado', eyes: 'open', brows: 'raised', mouth: 'soft', body: 'breathe', badge: 'pin', badgeColor: COLORS.blue, bob: true, ring: '#C9D1E4', ringMode: 'slow' },
  seguro: { label: 'lugar seguro', eyes: 'calm', brows: 'normal', mouth: 'soft', body: 'breathe', badge: 'home', badgeColor: '#3E7C5A', ring: '#7FB896', ringMode: 'steady' },
  checagem: { label: 'área de atenção', eyes: 'open', brows: 'concerned', mouth: 'flat', body: 'breathe', head: 'tilt', badge: 'question', badgeColor: '#9A6316', ring: '#E0A94A', ringMode: 'slow' },
  critico: { label: 'risco alto', eyes: 'open', brows: 'serious', mouth: 'worried', body: 'lean', badge: 'alert', badgeColor: '#B42318', ring: '#F07167', ringMode: 'fast' },
  contatos: { label: 'contatos avisados', eyes: 'open', brows: 'concerned', mouth: 'soft', body: 'breathe', badge: 'shield', badgeColor: COLORS.blue, ring: '#C9D1E4', ringMode: 'steady' },
  chegou: { label: 'chegou bem', eyes: 'happy', brows: 'raised', mouth: 'open', body: 'bounce', badge: 'check', badgeColor: '#3E7C5A', ring: '#7FB896', ringMode: 'slow', hearts: true },
}

const OLD_EXPRESSIONS = { acolhedora: 'oi', tranquila: 'seguro', atenta: 'checagem' }

const rgb = (color) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16))
const shadeColor = (color, factor) => `#${rgb(color).map((value) => Math.round(value * factor).toString(16).padStart(2, '0')).join('')}`
const mixWithWhite = (color, factor) => `#${rgb(color).map((value) => Math.round(value + (255 - value) * factor).toString(16).padStart(2, '0')).join('')}`

function SvgPortrait({ reaction, skin, hair, hairStyle, eyeShape, part, reduceMotion, transparentBackground, size }) {
  const face = REACTIONS[reaction] || REACTIONS.ociosa
  const penteado = HAIR_STYLES[hairStyle] || HAIR_STYLES.cacheado
  const skinLuminance = rgb(skin).reduce((sum, value, index) => sum + value * [0.299, 0.587, 0.114][index], 0) / 255
  const shade = shadeColor(skin, skinLuminance > 0.4 ? 0.84 : 0.78)
  const lip = skinLuminance > 0.72 ? '#B4545C' : skinLuminance > 0.58 ? '#9E4646' : skinLuminance > 0.45 ? '#8E3B3B' : skinLuminance > 0.32 ? '#6E2B29' : '#47191A'
  const blush = skinLuminance > 0.4 ? '#D9968F' : '#B5705F'
  const blushOpacity = skinLuminance > 0.4 ? (face.eyes === 'happy' ? 0.6 : 0.38) : (face.eyes === 'happy' ? 0.65 : 0.5)
  const hairLuminance = [1, 3, 5].reduce((sum, i, index) => sum + parseInt(hair.slice(i, i + 2), 16) * [0.299, 0.587, 0.114][index], 0) / 255
  const browColor = hairLuminance > 0.35
    ? `#${[1, 3, 5].map((i) => Math.round(parseInt(hair.slice(i, i + 2), 16) * 0.62).toString(16).padStart(2, '0')).join('')}`
    : hair
  const mouth = MOUTHS[face.mouth]
  const braidDark = shadeColor(hair, hairLuminance > 0.35 ? 0.62 : 0.55)
  const braidBack = shadeColor(hair, hairLuminance > 0.35 ? 0.86 : 0.85)
  const braidLine = shadeColor(hair, hairLuminance > 0.35 ? 0.55 : 0.45)
  const braidShine = mixWithWhite(hair, hairLuminance > 0.35 ? 0.3 : 0.22)
  const detailColor = hairLuminance > 0.35 ? shadeColor(hair, 0.72) : mixWithWhite(hair, 0.2)

  if (part === 'hairBack') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 400 400">
        {hairStyle === 'trancas' ? (
          <>
            <Path d={BRAIDS.cap} fill={braidDark} />
            <Path d={BRAIDS.backBase} fill="none" stroke={braidLine} strokeWidth="17" strokeLinecap="round" />
            <Path d={BRAIDS.backSegs} fill={braidBack} stroke={braidLine} strokeWidth="1.6" />
            <Path d={BRAIDS.backShine} fill="none" stroke={braidShine} strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : (
          <>
            {!!penteado.back && <Path d={penteado.back} fill={hair} />}
            {!!penteado.detail && <Path d={penteado.detail} fill="none" stroke={detailColor} strokeWidth="2.5" strokeLinecap="round" />}
          </>
        )}
      </Svg>
    )
  }

  if (part === 'body') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 400 400">
        <Path d="M58,440 L58,400 C68,332 120,298 200,298 C280,298 332,332 342,400 L342,440 Z" fill={COLORS.blue} />
      </Svg>
    )
  }

  if (part === 'neckFront') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 400 400" pointerEvents="none">
        {/* O pescoço desce um pouco por baixo do decote para não abrir fresta azul entre as duas curvas. */}
        <Path d="M174,250 L174,304 Q200,322 226,304 L226,250 Z" fill={shade} />
        <Path d="M166,300 Q200,313 234,300 L200,348 Z" fill={skin} />
        <Path d="M166,300 L200,348 L234,300" fill="none" stroke={COLORS.background} strokeWidth="5" strokeLinejoin="round" />
        <Circle cx="200" cy="332" r="5" fill={COLORS.blush} />
      </Svg>
    )
  }

  return (
    <View style={{ width: '100%', height: '100%' }}>
      <Svg width="100%" height="100%" viewBox="0 0 400 400">
      <Ellipse cx="133" cy="200" rx="12" ry="17" fill={skin} />
      <Ellipse cx="267" cy="200" rx="12" ry="17" fill={skin} />
      <Circle cx="131" cy="222" r="5" fill={COLORS.blush} />
      <Circle cx="269" cy="222" r="5" fill={COLORS.blush} />
      <Ellipse cx="200" cy="190" rx="68" ry="80" fill={skin} />
      <Circle cx="162" cy="217" r="12" fill={blush} opacity={blushOpacity} />
      <Circle cx="238" cy="217" r="12" fill={blush} opacity={blushOpacity} />
      <Path d={BROWS[face.brows][0]} fill="none" stroke={browColor} strokeWidth="4.5" strokeLinecap="round" />
      <Path d={BROWS[face.brows][1]} fill="none" stroke={browColor} strokeWidth="4.5" strokeLinecap="round" />
      <Path d="M200,200 Q195,213 203,216" fill="none" stroke={shade} strokeWidth="3" strokeLinecap="round" />
      <Path d={mouth.d} fill={mouth.fill === 'lip' ? lip : mouth.fill} stroke={lip} strokeWidth={mouth.width} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <AnimatedEyes eyes={face.eyes} closedColor={browColor} eyeShape={eyeShape} lookUp={!!face.look} size={size} reduceMotion={reduceMotion} />
      {face.talk && <TalkingMouth color={lip} reduceMotion={reduceMotion} />}
      <Svg width="100%" height="100%" viewBox="0 0 400 400" pointerEvents="none" style={portraitLayerStyle}>
        <G fill={hair}>
          {!!penteado.top && <Path d={penteado.top} />}
          {!!penteado.front && <Path d={penteado.front} />}
        </G>
        {hairStyle === 'trancas' && (
          <>
            <Path d={BRAIDS.crown} fill={braidDark} />
            <Path d={BRAIDS.frontBase} fill="none" stroke={braidLine} strokeWidth="19" strokeLinecap="round" />
            <Path d={BRAIDS.frontSegs} fill={hair} stroke={braidLine} strokeWidth="1.8" />
            <Path d={BRAIDS.frontShine} fill="none" stroke={braidShine} strokeWidth="1.8" strokeLinecap="round" />
            <Path d={BRAIDS.parts} fill="none" stroke={shade} strokeWidth="3" strokeLinecap="round" />
            <Path d={BRAIDS.acc} fill="none" stroke="#C9963F" strokeWidth="7" strokeLinecap="round" />
            <Path d={BRAIDS.acc} fill="none" stroke="#E8C474" strokeWidth="2.5" strokeLinecap="round" transform="translate(0,-1.5)" />
          </>
        )}
      </Svg>
    </View>
  )
}

function AnimatedEyes({ eyes, closedColor, eyeShape, lookUp, size = 400, reduceMotion }) {
  const scaleY = useSharedValue(1)
  const look = useSharedValue(lookUp ? 1 : 0)
  const scale = size / 400
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: look.value * 5 * scale }, { translateY: look.value * -6 * scale }, { scaleY: scaleY.value }],
  }))

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    look.value = withTiming(lookUp ? 1 : 0, { duration: 350, easing: Easing.ease })
  }, [lookUp, look])
  const open = eyes === 'open'

  useEffect(() => {
    cancelAnimation(scaleY)
    // Shared values are intentionally updated in effects when the reaction changes.
    // eslint-disable-next-line react-hooks/immutability
    scaleY.value = 1
    if (open && !reduceMotion) {
      scaleY.value = withRepeat(
        withSequence(withDelay(4232, withTiming(0.1, { duration: 138, easing: Easing.linear })), withTiming(1, { duration: 230, easing: Easing.linear })),
        -1,
        false,
      )
    }
    return () => cancelAnimation(scaleY)
  }, [eyes, open, reduceMotion, scaleY])

  return (
    <AnimatedView style={[{ position: 'absolute', inset: 0 }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 400">
        {[175, 225].map((x) => (
          <React.Fragment key={x}>
            <Path
            d={eyes === 'open' && eyeShape === 'amendoado'
              ? `M${x + (x === 175 ? -9 : 9)},188 Q${x},179 ${x + (x === 175 ? 9 : -9)},191 Q${x},199 ${x + (x === 175 ? -9 : 9)},188 Z`
              : EYES[eyes](x)}
              fill={open ? EYE_COLOR : 'none'}
              stroke={open ? 'none' : closedColor}
              strokeWidth={open ? 0 : 4}
              strokeLinecap="round"
            />
            {open && <Circle cx={x + 2} cy="187" r="2.2" fill="#FFF" />}
          </React.Fragment>
        ))}
      </Svg>
    </AnimatedView>
  )
}

function TalkingMouth({ color, reduceMotion }) {
  const opacity = useSharedValue(0)
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = reduceMotion
      ? 1
      : withRepeat(withSequence(withTiming(1, { duration: 0 }), withDelay(210, withTiming(0, { duration: 0 }))), -1, false)
    return () => cancelAnimation(opacity)
  }, [opacity, reduceMotion])
  return (
    <AnimatedView style={[{ position: 'absolute', inset: 0 }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 400">
        <Path d="M189,231 Q200,250 211,231 Q200,227 189,231 Z" fill={color} stroke={color} strokeWidth="2" />
      </Svg>
    </AnimatedView>
  )
}

function ThinkingDots({ size }) {
  return (
    <View style={{ position: 'absolute', top: size * 0.02, right: size * 0.01, width: size * 0.35, height: size * 0.17, borderRadius: size * 0.09, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * 0.035 }}>
      {[0, 1, 2].map((index) => <ThinkingDot key={index} index={index} size={size} />)}
    </View>
  )
}

function ThinkingDot({ index, size }) {
  const offset = useSharedValue(0)
  const opacity = useSharedValue(0.25)
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }], opacity: opacity.value }))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    offset.value = withDelay(index * 200, withRepeat(withSequence(withTiming(-4, { duration: 600 }), withTiming(0, { duration: 600 })), -1, false))
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = withDelay(index * 200, withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.25, { duration: 600 })), -1, false))
    return () => { cancelAnimation(offset); cancelAnimation(opacity) }
  }, [index, offset, opacity])
  return <AnimatedView style={[{ width: size * 0.06, height: size * 0.06, borderRadius: size * 0.03, backgroundColor: COLORS.blue }, style]} />
}

function FloatingHearts({ size }) {
  return [
    { left: 0.12, top: 0.26, color: '#D9968F', diameter: 28, delay: 0 },
    { left: 0.78, top: 0.34, color: '#EBD3CD', diameter: 22, delay: 800 },
    { left: 0.2, top: 0.58, color: '#EBD3CD', diameter: 20, delay: 1600 },
  ].map((heart, index) => <FloatingHeart key={index} {...heart} size={size} />)
}

function FloatingHeart({ size, left, top, color, diameter, delay }) {
  const progress = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.2 ? progress.value * 5 : 1 - (progress.value - 0.2) / 0.8,
    transform: [{ translateY: -progress.value * size * 0.3 }, { scale: 0.6 + progress.value * 0.5 }],
  }))
  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false))
    return () => cancelAnimation(progress)
  }, [delay, progress])
  return (
    <AnimatedView style={[{ position: 'absolute', left: size * left, top: size * top, width: size * 0.12, height: size * 0.12 }, style]} pointerEvents="none">
      <Svg width={diameter} height={diameter} viewBox="0 0 24 24"><Path d={ICONS.heart} fill={color} /></Svg>
    </AnimatedView>
  )
}

export default function LiaAvatar({
  size = 40,
  reaction,
  reacao,
  expression,
  skin,
  hair,
  hairStyle,
  eyes,
  showRing = true,
  showBadge = true,
  transparentBackground = false,
  accessibilityLabel,
}) {
  const requestedReaction = reaction || reacao || OLD_EXPRESSIONS[expression] || expression || 'ociosa'
  const currentReaction = REACTIONS[requestedReaction] ? requestedReaction : 'ociosa'
  const face = REACTIONS[currentReaction]
  const [aparenciaSalva, setAparenciaSalva] = useState(APARENCIA_PADRAO_LIA)
  const tomPele = skin || aparenciaSalva.skin
  const corCabelo = hair || aparenciaSalva.hair
  const penteado = hairStyle || aparenciaSalva.hairStyle
  const formatoOlhos = eyes || aparenciaSalva.eyes
  const [reduceMotion, setReduceMotion] = useState(false)
  const [previousReaction, setPreviousReaction] = useState(null)
  const previousReactionRef = useRef(null)
  const bodyY = useSharedValue(0)
  const bodyScale = useSharedValue(1)
  const headAngle = useSharedValue(0)
  const headY = useSharedValue(0)
  const badgeScale = useSharedValue(1)
  const badgeY = useSharedValue(0)
  const faceOpacity = useSharedValue(1)
  const ringScale = useSharedValue(1)
  const ringOpacity = useSharedValue(face.ringMode === 'steady' ? 1 : 0)
  const scale = size / 400

  useEffect(() => {
    let ativo = true
    carregarAparenciaLia().then((valor) => { if (ativo) setAparenciaSalva(valor) })
    const cancelar = observarAparenciaLia(setAparenciaSalva)
    return () => { ativo = false; cancelar() }
  }, [])

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((value) => mounted && setReduceMotion(value))
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => {
      mounted = false
      subscription?.remove()
    }
  }, [])

  useEffect(() => {
    if (previousReactionRef.current === currentReaction) return undefined
    const previous = previousReactionRef.current
    previousReactionRef.current = currentReaction
    if (!previous) return undefined

    setPreviousReaction(previous)
    // Crossfade expression layers to avoid a hard face swap.
    faceOpacity.value = 0
    faceOpacity.value = withTiming(1, { duration: 300, easing: Easing.ease })
    const timer = setTimeout(() => setPreviousReaction(null), 300)
    return () => clearTimeout(timer)
  }, [currentReaction, faceOpacity])

  useEffect(() => {
    [bodyY, bodyScale, headAngle, headY, ringScale, ringOpacity, badgeY].forEach(cancelAnimation)
    bodyY.value = 0
    bodyScale.value = 1
    headAngle.value = 0
    headY.value = 0
    ringScale.value = 1
    ringOpacity.value = face.ringMode === 'steady' ? 1 : 0
    badgeY.value = 0

    if (reduceMotion) return
    if (face.body === 'breathe') {
      bodyY.value = withRepeat(withSequence(withTiming(-4 * scale, { duration: 2000, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })), -1, false)
    } else if (face.body === 'bounce') {
      bodyY.value = withRepeat(withSequence(
        withTiming(-14 * scale, { duration: 330, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 275, easing: Easing.inOut(Easing.ease) }),
        withTiming(-5 * scale, { duration: 187, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 308, easing: Easing.inOut(Easing.ease) }),
      ), -1, false)
    } else if (face.body === 'lean') {
      bodyScale.value = withRepeat(withSequence(withTiming(1.035, { duration: 500, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), -1, false)
    }

    if (face.head === 'wave') {
      headAngle.value = withRepeat(withSequence(
        withTiming(-7, { duration: 288, easing: Easing.inOut(Easing.ease) }),
        withTiming(6, { duration: 336, easing: Easing.inOut(Easing.ease) }),
        withTiming(-3, { duration: 336, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 360, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1080, easing: Easing.inOut(Easing.ease) }),
      ), -1, false)
    } else if (face.head === 'nod') {
      headY.value = withRepeat(withSequence(withTiming(5 * scale, { duration: 640, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 960, easing: Easing.inOut(Easing.ease) })), -1, false)
      headAngle.value = withRepeat(withSequence(withTiming(1, { duration: 640, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 960, easing: Easing.inOut(Easing.ease) })), -1, false)
    } else if (face.head === 'tilt') {
      headAngle.value = withRepeat(withSequence(withTiming(-7, { duration: 1300, easing: Easing.inOut(Easing.ease) }), withTiming(-3, { duration: 1300, easing: Easing.inOut(Easing.ease) })), -1, false)
    }

    if (face.ringMode === 'slow' || face.ringMode === 'fast') {
      const duration = face.ringMode === 'fast' ? 900 : 2400
      ringScale.value = withRepeat(withSequence(withTiming(1.16, { duration, easing: Easing.out(Easing.quad) }), withTiming(0.96, { duration: 0 })), -1, false)
      ringOpacity.value = withRepeat(withSequence(withTiming(0, { duration, easing: Easing.out(Easing.quad) }), withTiming(0.9, { duration: 0 })), -1, false)
    }
    if (face.bob) badgeY.value = withRepeat(withSequence(withTiming(-6 * scale, { duration: 600, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) })), -1, false)
    return () => [bodyY, bodyScale, headAngle, headY, ringScale, ringOpacity, badgeY].forEach(cancelAnimation)
  }, [currentReaction, reduceMotion, size, bodyY, bodyScale, headAngle, headY, ringScale, ringOpacity, badgeY, face, scale])

  useEffect(() => {
    cancelAnimation(badgeScale)
    badgeScale.value = reduceMotion ? 1 : withSequence(
      withTiming(0.3, { duration: 0 }),
      withTiming(1, { duration: 450, easing: Easing.out(Easing.back(1.6)) }),
    )
    return () => cancelAnimation(badgeScale)
  }, [currentReaction, reduceMotion, badgeScale])

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bodyY.value }, { scale: bodyScale.value },
      { translateX: 200 * scale }, { translateY: 290 * scale + headY.value },
      { rotate: `${headAngle.value}deg` }, { translateX: -200 * scale }, { translateY: -290 * scale },
    ],
  }))
  const currentFaceStyle = useAnimatedStyle(() => ({ opacity: faceOpacity.value }))
  const previousFaceStyle = useAnimatedStyle(() => ({ opacity: 1 - faceOpacity.value }))
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.value }, { translateY: badgeY.value }] }))
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }], opacity: ringOpacity.value }))
  const ringColor = face.ring || 'transparent'
  const badgeSize = Math.max(16, size * 0.22)

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel || `Lia, ${face.label}`}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'visible', alignItems: 'center', justifyContent: 'center' }}
    >
      {showRing && face.ring && size >= 48 && (
        <AnimatedView style={[{ position: 'absolute', width: size + 14, height: size + 14, borderRadius: (size + 14) / 2, borderWidth: 4, borderColor: ringColor }, ringStyle]} />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: transparentBackground ? 'transparent' : COLORS.background }}>
        <AnimatedView style={[{ width: size, height: size, position: 'absolute' }, bodyStyle]}>
          {/* Blusa antes do cabelo de trás: o cabelo longo (e as tranças) cai por cima dos ombros, como na referência. */}
          <AnimatedView style={portraitLayerStyle} pointerEvents="none">
            <SvgPortrait part="body" reaction={currentReaction} skin={tomPele} hair={corCabelo} hairStyle={penteado} eyeShape={formatoOlhos} reduceMotion={reduceMotion} transparentBackground={transparentBackground} />
          </AnimatedView>
          <AnimatedView style={portraitLayerStyle} pointerEvents="none">
            <SvgPortrait part="hairBack" reaction={currentReaction} skin={tomPele} hair={corCabelo} hairStyle={penteado} eyeShape={formatoOlhos} reduceMotion={reduceMotion} />
          </AnimatedView>
          <AnimatedView style={portraitLayerStyle} pointerEvents="none">
            <SvgPortrait part="neckFront" reaction={currentReaction} skin={tomPele} hair={corCabelo} hairStyle={penteado} eyeShape={formatoOlhos} reduceMotion={reduceMotion} />
          </AnimatedView>
          {previousReaction && (
            <AnimatedView style={[{ position: 'absolute', width: size, height: size, left: 0, top: 0 }, previousFaceStyle]} pointerEvents="none">
              <SvgPortrait part="head" reaction={previousReaction} skin={tomPele} hair={corCabelo} hairStyle={penteado} eyeShape={formatoOlhos} reduceMotion={reduceMotion} size={size} />
            </AnimatedView>
          )}
          <AnimatedView style={[{ position: 'absolute', width: size, height: size, left: 0, top: 0 }, currentFaceStyle]} pointerEvents="none">
            <AnimatedView style={portraitLayerStyle}>
              <SvgPortrait part="head" reaction={currentReaction} skin={tomPele} hair={corCabelo} hairStyle={penteado} eyeShape={formatoOlhos} reduceMotion={reduceMotion} size={size} />
            </AnimatedView>
          </AnimatedView>
        </AnimatedView>
        {face.look && face.dots && !reduceMotion && <ThinkingDots size={size} />}
        {face.hearts && !reduceMotion && <FloatingHearts size={size} />}
      </View>
      {showBadge && face.badge && size >= 48 && (
        <AnimatedView style={[{ position: 'absolute', right: -2, top: -2, width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, borderWidth: Math.max(2, size * 0.01), borderColor: COLORS.background, backgroundColor: face.badgeColor || COLORS.blue, alignItems: 'center', justifyContent: 'center' }, badgeStyle]}>
          <Svg width={badgeSize * 0.58} height={badgeSize * 0.58} viewBox="0 0 24 24">
            <Path d={ICONS[face.badge]} fill={face.badge === 'heart' ? '#FFF' : 'none'} stroke="#FFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </AnimatedView>
      )}
    </View>
  )
}

export { REACTIONS as LIA_REACTIONS }
