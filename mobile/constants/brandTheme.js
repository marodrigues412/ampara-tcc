export const Brand = {
  canvas: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRose: '#FBE8EF',
  surfaceSoft: '#FFF3F6',
  rose: '#C83F69',
  ink: '#332831',
  muted: '#756670',
  line: '#EED9E1',
  blue: '#527895',
  blueSoft: '#EEF4F8',
  mint: '#E8F4EF',
  green: '#2F7962',
  amber: '#A65D00',
  amberSoft: '#FFF2DF',
  danger: '#B83D53',
}

// Cada aba da barra de navegação tem uma cor: o fundo claro do header (fundo), as
// curvas desenhadas nele (curva) e a cor forte do título, do ícone ativo e dos botões
// (forte). A barra usa a cor forte da aba aberta.
export const TemaDaAba = {
  'Proteção': { fundo: '#F7E7EC', curva: '#EFCFDA', forte: '#BD5574' },
  Mapa: { fundo: '#E9EFF2', curva: '#CFDCE4', forte: '#3F6A86' },
  Dashboard: { fundo: '#EAF1EA', curva: '#CFE2D3', forte: '#287861' },
  Assistente: { fundo: '#EFEAF5', curva: '#DDD3EB', forte: '#6E5A9E' },
  // O fundo do Perfil era o creme; com o app todo em creme, ganhou um azul bem claro.
  Perfil: { fundo: '#E9EDF5', curva: '#D6DDEB', forte: '#273963' },
  // Telas antes do login: o creme do site (--paper), com o rosa da marca.
  Entrada: { fundo: '#F8F4F1', curva: '#ECE2DC', forte: '#BD5574' },
}

// Fundo creme das telas antes do login, igual ao do site.
export const CremeDoSite = '#F8F4F1'

// Cor dos ícones e rótulos das abas que não estão abertas.
export const CorAbaInativa = '#776C73'

// Fonte do nome da Lia (carregada em App.js).
export const FonteDaLia = 'Fraunces_500Medium_Italic'
