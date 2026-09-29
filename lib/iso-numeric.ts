/**
 * ISO 3166-1 alpha-2 to numeric codes. The API speaks alpha-2; the world-atlas map shapes are
 * keyed by numeric code. Covers every African country plus the delegate markets outside Africa;
 * a country missing here still shows in the list beside the map, just not shaded on it.
 */
export const ISO_NUMERIC: Record<string, string> = {
  // Africa
  DZ: '012', AO: '024', BJ: '204', BW: '072', BF: '854', BI: '108', CV: '132', CM: '120', CF: '140', TD: '148',
  KM: '174', CG: '178', CD: '180', CI: '384', DJ: '262', EG: '818', GQ: '226', ER: '232', SZ: '748', ET: '231',
  GA: '266', GM: '270', GH: '288', GN: '324', GW: '624', KE: '404', LS: '426', LR: '430', LY: '434', MG: '450',
  MW: '454', ML: '466', MR: '478', MU: '480', MA: '504', MZ: '508', NA: '516', NE: '562', NG: '566', RW: '646',
  ST: '678', SN: '686', SC: '690', SL: '694', SO: '706', ZA: '710', SS: '728', SD: '729', TZ: '834', TG: '768',
  TN: '788', UG: '800', EH: '732', ZM: '894', ZW: '716',
  // Americas
  US: '840', CA: '124', MX: '484', BR: '076', AR: '032', CL: '152', CO: '170', PE: '604', JM: '388', TT: '780',
  // Europe
  GB: '826', IE: '372', FR: '250', DE: '276', NL: '528', BE: '056', ES: '724', PT: '620', IT: '380', CH: '756',
  AT: '040', SE: '752', NO: '578', DK: '208', FI: '246', PL: '616', CZ: '203', GR: '300', RO: '642', HU: '348',
  UA: '804', RU: '643', TR: '792',
  // Middle East and Asia-Pacific
  AE: '784', SA: '682', QA: '634', IL: '376', JO: '400', LB: '422', IN: '356', PK: '586', BD: '050', CN: '156',
  JP: '392', KR: '410', SG: '702', MY: '458', ID: '360', PH: '608', TH: '764', VN: '704', AU: '036', NZ: '554',
};
