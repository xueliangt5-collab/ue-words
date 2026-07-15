from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]


def make_icon(size: int) -> None:
    scale = size / 512
    image = Image.new('RGB', (size, size), '#18181b')
    draw = ImageDraw.Draw(image)
    radius = round(96 * scale)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill='#18181b')

    draw.rounded_rectangle(
        tuple(round(value * scale) for value in (104, 112, 296, 370)),
        radius=round(24 * scale),
        fill='#f7f7f5',
    )
    draw.rounded_rectangle(
        tuple(round(value * scale) for value in (216, 112, 408, 370)),
        radius=round(24 * scale),
        fill='#d9f99d',
    )
    draw.polygon(
        [(round(x * scale), round(y * scale)) for x, y in ((104, 344), (224, 344), (256, 400), (288, 344), (408, 344), (408, 370), (288, 370), (256, 414), (224, 370), (104, 370))],
        fill='#18181b',
    )

    font_path = Path('C:/Windows/Fonts/segoeuib.ttf')
    font = ImageFont.truetype(str(font_path), round(112 * scale))
    text = 'UE'
    box = draw.textbbox((0, 0), text, font=font)
    text_width = box[2] - box[0]
    draw.text(((size - text_width) / 2, round(174 * scale)), text, font=font, fill='#18181b')
    image.save(ROOT / 'public' / f'icon-{size}.png', optimize=True)


for icon_size in (192, 512):
    make_icon(icon_size)
