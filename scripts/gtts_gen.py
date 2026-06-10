"""Generate TTS audio using edge-tts with a male voice."""
import sys, asyncio
import edge_tts

text = sys.argv[1]
out = sys.argv[2]

async def go():
    # Male US voice — deep, professional tone
    voice = "en-US-GuyNeural"
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out)
    print(f"OK - saved to {out}")

asyncio.run(go())
