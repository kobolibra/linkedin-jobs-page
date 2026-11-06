/**
 * DESIGN STUDY ONLY: three distinctly art-directed palettes for the exact same
 * My Journey Sankey. This module is not linked from production HTML and is
 * used only by the Chromium visual review harness.
 *
 * Principles: progression has ONE semantic hue, outcomes own their own hue,
 * source/waiting are context, and color contrast is independently designed
 * for both themes. Avoid gratuitous stage-by-stage rainbow ramps.
 */
const make = ({ canvas, heading, muted, border, source, process, offer, noResponse, rejected,
  waiting, sourceFlow, processFlow, offerFlow, noResponseFlow, rejectedFlow, waitingFlow }) => ({
  '--ap-canvas':canvas, '--ap-heading':heading, '--ap-figure-secondary':muted,
  '--ap-paper-border':border, '--ap-paper-quiet':border,
  '--ap-wash':'transparent',
  '--ap-flow-outline':heading,
  '--ap-tone-source':source, '--ap-flow-source':sourceFlow,
  ...Object.fromEntries(['applied','contact','first','second','final'].flatMap(stage=>[
    ['--ap-tone-'+stage,process],['--ap-flow-'+stage,processFlow]
  ])),
  '--ap-tone-offer':offer, '--ap-flow-offer':offerFlow,
  '--ap-tone-no_response':noResponse, '--ap-flow-no_response':noResponseFlow,
  '--ap-tone-rejected':rejected, '--ap-flow-rejected':rejectedFlow,
  '--ap-tone-waiting':waiting, '--ap-flow-waiting':waitingFlow,
});
export const palettes = {
  editorial: {
    label: '01 / Editorial Cobalt',
    principle: 'One confident cobalt journey; restrained context and precisely separated outcomes.',
    light: make({
      canvas:'#FBFAF7',heading:'#15223A',muted:'#5B6573',border:'#DCE1E7',
      source:'#5B6573',process:'#2055AD',offer:'#097A57',noResponse:'#885A13',
      rejected:'#A92C47',waiting:'#5E6771',sourceFlow:'#C5CCD7',processFlow:'#3979DA',
      offerFlow:'#16B987',noResponseFlow:'#E3A642',rejectedFlow:'#E44B68',waitingFlow:'#B8C2CD',
    }),
    dark: make({
      canvas:'#131C2B',heading:'#F5F7FA',muted:'#C1C9D6',border:'#364155',
      source:'#C1C9D6',process:'#B6D0FF',offer:'#7CE5B3',noResponse:'#F6C67C',
      rejected:'#FF9CAE',waiting:'#BFCCD9',sourceFlow:'#4A5670',processFlow:'#3975D8',
      offerFlow:'#199C73',noResponseFlow:'#AF7530',rejectedFlow:'#BE445D',waitingFlow:'#526075',
    }),
  },
  signal: {
    label: '02 / Signal Lagoon',
    principle: 'Energizing marine cyan and fresh citrus result, in controlled quantities.',
    light: make({
      canvas:'#FCFCFA',heading:'#142930',muted:'#596B6B',border:'#DCE7E5',
      source:'#596B6B',process:'#00748A',offer:'#437300',noResponse:'#8D5C08',
      rejected:'#AD3151',waiting:'#5F6B6E',sourceFlow:'#C1D2D2',processFlow:'#04A7C4',
      offerFlow:'#8FC736',noResponseFlow:'#E6A842',rejectedFlow:'#DE5475',waitingFlow:'#B6CBCE',
    }),
    dark: make({
      canvas:'#101D20',heading:'#F0FAF8',muted:'#BCD3D1',border:'#345154',
      source:'#BCD3D1',process:'#81E5F3',offer:'#B8EA69',noResponse:'#FFD27B',
      rejected:'#FF98B0',waiting:'#BBCFCD',sourceFlow:'#425C60',processFlow:'#138DA8',
      offerFlow:'#729F30',noResponseFlow:'#AD7830',rejectedFlow:'#BC4768',waitingFlow:'#426268',
    }),
  },
  gallery: {
    label: '03 / Gallery Ultraviolet',
    principle: 'A single gallery-grade violet, a surgical emerald accent and sharp coral outcomes.',
    light: make({
      canvas:'#FCFAFF',heading:'#241B37',muted:'#615E70',border:'#E2DDEB',
      source:'#615E70',process:'#5C3EB2',offer:'#067E69',noResponse:'#8C5610',
      rejected:'#AC2C5C',waiting:'#626273',sourceFlow:'#CCC7D9',processFlow:'#8256E7',
      offerFlow:'#0CAD90',noResponseFlow:'#E59A3C',rejectedFlow:'#E04F85',waitingFlow:'#C5C0D1',
    }),
    dark: make({
      canvas:'#1B162A',heading:'#F9F4FF',muted:'#CAC3D6',border:'#494059',
      source:'#CAC3D6',process:'#C9B4FF',offer:'#80F0D1',noResponse:'#F9CA83',
      rejected:'#FF9EC4',waiting:'#C9C3D4',sourceFlow:'#574D6B',processFlow:'#7651DC',
      offerFlow:'#149B88',noResponseFlow:'#A87332',rejectedFlow:'#C14B7D',waitingFlow:'#5B5470',
    }),
  },
};
export const roles=['source','applied','contact','first','second','final','offer','no_response','rejected','waiting'];
