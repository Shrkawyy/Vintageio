"""Extract timestamped contact sheets from the supplied local FFA recording."""
import argparse
import io
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import imageio_ffmpeg
from PIL import Image, ImageDraw

VIDEO = Path('C:/Users/sch2/OneDrive/Videos/Captures/ONYX and 7 more pages - Personal - Microsoft\u200b Edge 2026-10-23 09-42-59.mp4')
OUT = Path(__file__).resolve().parents[1] / 'artifacts/ffa-2026-10-23'

def frame(t):
    data = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-ss', str(t), '-i', str(VIDEO), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-threads', '1', '-'], capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(data)).convert('RGB')

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('name')
    p.add_argument('times', nargs='+', type=float)
    p.add_argument('--width', type=int, default=480)
    args = p.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    w, h = args.width, round(args.width * .6)
    sheet = Image.new('RGB', (w*4, (h+25)*((len(args.times)+3)//4)), '#202020')
    draw = ImageDraw.Draw(sheet)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, (t, im) in enumerate(zip(args.times, pool.map(frame, args.times))):
            im.save(OUT / f'{args.name}-{t:08.3f}.png')
            x, y = i%4*w, i//4*(h+25)
            sheet.paste(im.resize((w,h)), (x,y))
            draw.text((x+5,y+h+4), f'{int(t)//60:02}:{t%60:05.2f}', fill='white')
    sheet.save(OUT / f'{args.name}-sheet.jpg', quality=90)
    print(OUT / f'{args.name}-sheet.jpg')
