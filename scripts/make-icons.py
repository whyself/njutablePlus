# 生成扩展图标：python scripts/make-icons.py → icons/icon-{16,32,48,128}.png
# 南大紫渐变圆角底 + 白色表格卡片 + 金色"+"徽标。侧边栏顶栏和空状态直接用 icon-128.png。
from PIL import Image, ImageDraw

S = 1024

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def draw():
    # 底：左上 → 右下的紫色渐变，圆角
    grad = Image.new('RGB', (S, S))
    top, bottom = (0x8E, 0x3F, 0xB0), (0x4B, 0x10, 0x6E)
    px = grad.load()
    for y in range(S):
        for x in range(S):
            px[x, y] = lerp(top, bottom, (x + y) / (2 * S - 2))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((24, 24, S - 24, S - 24), radius=230, fill=255)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)

    # 表格卡片：白底，表头一行半透明紫，竖线横线分格
    x0, y0, x1, y1 = 196, 236, 772, 732
    d.rounded_rectangle((x0, y0, x1, y1), radius=64, fill=(255, 255, 255, 255))
    head = 372
    d.rounded_rectangle((x0, y0, x1, head), radius=64, fill=(0xE9, 0xD8, 0xF2, 255))
    d.rectangle((x0, head - 64, x1, head), fill=(0xE9, 0xD8, 0xF2, 255))
    line = (0xC9, 0xAE, 0xDB, 255)
    for x in (388, 580):
        d.rectangle((x - 8, y0 + 24, x + 8, y1 - 24), fill=line)
    for y in (head, 552):
        d.rectangle((x0 + 24, y - 8, x1 - 24, y + 8), fill=line)

    # "+" 徽标：金色圆，白边，紫色加号
    cx, cy, r = 760, 740, 178
    d.ellipse((cx - r - 28, cy - r - 28, cx + r + 28, cy + r + 28), fill=(255, 255, 255, 255))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0xF6, 0xB9, 0x3B, 255))
    w, l = 28, 100
    plus = (0x4B, 0x10, 0x6E, 255)
    d.rounded_rectangle((cx - l, cy - w, cx + l, cy + w), radius=w, fill=plus)
    d.rounded_rectangle((cx - w, cy - l, cx + w, cy + l), radius=w, fill=plus)
    return img

big = draw()
for size in (16, 32, 48, 128):
    big.resize((size, size), Image.LANCZOS).save(f'icons/icon-{size}.png')
print('ok')
