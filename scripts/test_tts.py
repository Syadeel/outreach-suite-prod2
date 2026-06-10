import asyncio
import edge_tts
import aiohttp
import sys

async def test_connectivity():
    # First check if we can connect at all
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('https://www.google.com', timeout=10) as resp:
                print(f'Google OK: {resp.status}')
    except Exception as e:
        print(f'Google FAIL: {e}')

    # Check edge_tts specific URL
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('https://speech.platform.bing.com/consumer/speech/synthesize', timeout=10) as resp:
                print(f'Bing speech OK: {resp.status}')
    except Exception as e:
        print(f'Bing speech FAIL: {e}')

    # Try the newer edge_tts API
    try:
        voices = await edge_tts.list_voices()
        print(f'Voices API OK: {len(voices)} voices')
        for v in voices[:2]:
            name = v.get('ShortName', '?')
            locale = v.get('Locale', '?')
            print(f'  {name} - {locale}')
    except Exception as e:
        print(f'Voices API FAIL: {e}')

asyncio.run(test_connectivity())
