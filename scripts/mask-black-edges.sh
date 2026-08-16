#!/usr/bin/env bash
# Make the black collar left behind by georeferencing transparent.
#
# Rotating a scan into a projection leaves black wedges in the corners of the
# bounding box. nearblack scans inward from each edge and stops at the first
# real content, so only black that touches an edge is masked -- black linework
# and text inside the map keep their pixels. The mask is written as an alpha
# band, which every renderer understands, rather than as a nodata value (a
# nodata of 0 would also knock out every black line in the map itself).
#
# The output is tiled, compressed, and carries overviews, so it opens fast in
# QGIS instead of hanging the way a striped full-resolution scan does.
#
#   ./scripts/mask-black-edges.sh <in.tif> [out.tif]
#
# The input is never modified; out.tif defaults to <in>-alpha.tif.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: mask-black-edges.sh [options] <in.tif> [out.tif]

  --near <n>      how far from pure black still counts as collar (default 20)
  --nb <n>        consecutive non-collar pixels that stop the inward scan (default 2)
  --white         also mask a white/near-white collar
  --color <r,g,b> also mask this collar color; repeatable (e.g. --color 200,200,200)
  --no-overviews  skip building internal overviews
  --force         overwrite out.tif if it exists
EOF
  exit 2
}

die() { echo "error: $*" >&2; exit 1; }

near=20
nb=2
overviews=1
force=0
extra=()
args=()

while (($#)); do
  case "$1" in
    --near) [[ ${2-} ]] || die "--near needs a value"; near=$2; shift ;;
    --nb) [[ ${2-} ]] || die "--nb needs a value"; nb=$2; shift ;;
    --white) extra+=(-white) ;;
    --color) [[ ${2-} ]] || die "--color needs r,g,b"; extra+=(-color "$2"); shift ;;
    --no-overviews) overviews=0 ;;
    --force | -f) force=1 ;;
    -h | --help) usage ;;
    -*) echo "error: unknown option: $1" >&2; usage ;;
    *) args+=("$1") ;;
  esac
  shift
done

((${#args[@]} >= 1 && ${#args[@]} <= 2)) || usage
src=${args[0]}
dst=${args[1]-${src%.*}-alpha.tif}
if [[ $src == -* ]]; then src=./$src; fi
if [[ $dst == -* ]]; then dst=./$dst; fi

[[ $near =~ ^[0-9]+$ ]] || die "--near must be a non-negative integer: $near"
[[ $nb =~ ^[0-9]+$ ]] || die "--nb must be a non-negative integer: $nb"

for tool in gdalinfo nearblack gdal_edit.py gdaladdo jq; do
  command -v "$tool" >/dev/null || die "$tool not found on PATH"
done

[[ -f $src ]] || die "input is not a file: $src"
if [[ -e $dst ]]; then
  ((force)) || die "output already exists: $dst (pass --force to overwrite)"
  [[ $(stat -L -c '%d:%i' -- "$src") != $(stat -L -c '%d:%i' -- "$dst") ]] ||
    die "output is the same file as the input: $src"
fi

info=$(gdalinfo -json "$src") || die "gdalinfo failed on $src"
bands=$(jq -r '.bands | length' <<<"$info")
case $bands in
  1 | 3 | 4) ;;
  *) die "nearblack needs a 1-, 3-, or 4-band raster; $src has $bands" ;;
esac

if jq -e '(.coordinateSystem.wkt // "") | length == 0' <<<"$info" >/dev/null; then
  echo "note: $src has no CRS; masking anyway, but the output won't be georeferenced" >&2
fi
if jq -e '[.bands[].colorInterpretation] | index("Alpha")' <<<"$info" >/dev/null; then
  echo "note: $src already has an alpha band; it will be recomputed" >&2
fi

nearblack -setalpha -near "$near" -nb "$nb" "${extra[@]}" \
  -co TILED=YES -co COMPRESS=DEFLATE -co PREDICTOR=2 -co BIGTIFF=IF_SAFER \
  -o "$dst" "$src" || die "nearblack failed on $src"

# Alpha is now the authoritative mask. Any inherited nodata=0 has to go, or
# renderers that honour it will punch holes through the map's own black ink.
gdal_edit.py -unsetnodata "$dst" >/dev/null 2>&1 || true

if ((overviews)); then
  gdaladdo -r average --config COMPRESS_OVERVIEW DEFLATE "$dst" >/dev/null ||
    die "gdaladdo failed on $dst"
fi

masked=$(python3 - "$dst" <<'PY' 2>/dev/null || echo "?"
import sys
from osgeo import gdal
gdal.UseExceptions()
ds = gdal.Open(sys.argv[1])
band = ds.GetRasterBand(ds.RasterCount)
a = band.ReadAsArray(buf_xsize=min(ds.RasterXSize, 512), buf_ysize=min(ds.RasterYSize, 512))
print(f"{(a == 0).mean() * 100:.1f}%")
PY
)

echo "wrote $dst (alpha band added, ~$masked of the frame masked transparent)"
