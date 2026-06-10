from gtts import gTTS
import os

tts = gTTS('Hello world test', lang='en')
out = os.path.join(os.environ['TEMP'], 'gtts_test.mp3')
tts.save(out)
size = os.path.getsize(out)
print(f'gTTS OK - {size} bytes')
os.remove(out)
