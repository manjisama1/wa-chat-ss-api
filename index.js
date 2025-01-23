const express = require('express')
const multer = require('multer')
const Jimp = require('jimp')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const upload = multer({ dest: 'uploads/' })

function generateRandomTime() {
  const hours = Math.floor(Math.random() * 12) + 1
  const minutes = Math.floor(Math.random() * 60)
    .toString()
    .padStart(2, '0')
  const period = Math.random() < 0.5 ? 'am' : 'pm'
  return `${hours}:${minutes} ${period}`
}

async function createImage(text, name, grayText, profileImagePath) {
  try {
    const background = await Jimp.read('assets/bg.png')
    const fontName = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)
    const fontText = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
    const fontTime = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)

    let profilePic
    try {
      if (profileImagePath && fs.existsSync(profileImagePath)) {
        profilePic = await Jimp.read(profileImagePath)
      } else {
        profilePic = await Jimp.read('assets/pfp.webp')
      }
    } catch (err) {
      console.error('Error loading profile picture:', err)
      profilePic = await Jimp.read('assets/pfp.webp')
    }
    profilePic.circle().resize(150, 150)

    const fixedWidth = 420
    const wrappedText = wrapText(text, fontText, fixedWidth)
    const textHeight = wrappedText.length * Jimp.measureTextHeight(fontText, 'A', fixedWidth) + 30
    const rectHeight = textHeight + 140

    const canvasHeight = background.bitmap.height
    const profileX = 30
    const profileY = (canvasHeight - profilePic.bitmap.height) / 2
    const rectX = profileX + profilePic.bitmap.width + 10
    const paddingBetweenTexts = 30
    const rectY = (canvasHeight - rectHeight) / 2 + paddingBetweenTexts

    const roundedRect = new Jimp(fixedWidth + 400, rectHeight, 0x232525ff)
    roundedRect.scan(0, 0, roundedRect.bitmap.width, roundedRect.bitmap.height, (x, y, idx) => {
      const radius = 30
      if (
        (x < radius && y < radius && Math.hypot(x - radius, y - radius) > radius) ||
        (x < radius &&
          y >= roundedRect.bitmap.height - radius &&
          Math.hypot(x - radius, y - (roundedRect.bitmap.height - radius)) > radius) ||
        (x >= roundedRect.bitmap.width - radius &&
          y < radius &&
          Math.hypot(x - (roundedRect.bitmap.width - radius), y - radius) > radius) ||
        (x >= roundedRect.bitmap.width - radius &&
          y >= roundedRect.bitmap.height - radius &&
          Math.hypot(
            x - (roundedRect.bitmap.width - radius),
            y - (roundedRect.bitmap.height - radius)
          ) > radius)
      ) {
        roundedRect.bitmap.data[idx + 3] = 0
      }
    })

    background.composite(profilePic, profileX, profileY)
    background.composite(roundedRect, rectX, rectY)

    const textImage = new Jimp(420, 50, 0x00000000)
    textImage.print(fontName, 0, 0, name || 'Unknown User')
    textImage.scale(1.5)
    const orangeOverlay = new Jimp(textImage.bitmap.width, textImage.bitmap.height, 0xffff00ff)
    orangeOverlay.mask(textImage, 0, 0)
    background.composite(orangeOverlay, rectX + 30, rectY + 20)

    const verticalOffset = 80
    wrappedText.forEach((line, i) => {
      background.print(
        fontText,
        rectX + 30,
        rectY + verticalOffset + i * Jimp.measureTextHeight(fontText, 'A', fixedWidth),
        {
          text: line.trim(),
          alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
        }
      )
    })

    const grayTextImage = new Jimp(fixedWidth, 50, 0x00000000)
    grayTextImage.print(fontTime, 0, 0, grayText)
    grayTextImage.scale(1.2)
    const grayOverlay = new Jimp(
      grayTextImage.bitmap.width,
      grayTextImage.bitmap.height,
      0x808080ff
    )
    grayOverlay.mask(grayTextImage, 0, 0)

    const grayTextX = rectX + fixedWidth + 230
    const grayTextY =
      rectY + 60 + wrappedText.length * Jimp.measureTextHeight(fontText, 'A', fixedWidth) + 50
    background.composite(grayOverlay, grayTextX, grayTextY)

    const uniqueFileName = `output_${Date.now()}.png`
    const outputPath = path.join(__dirname, uniqueFileName)

    await background.writeAsync(outputPath)
    console.log('Image created successfully:', uniqueFileName)

    return uniqueFileName
  } catch (error) {
    console.error('Error creating image:', error)
    throw error
  }
}

function wrapText(text, font, width) {
  const wrappedText = []
  let currentLine = ''

  for (let i = 0; i < text.length; i += 25) {
    const segment = text.slice(i, i + 25)
    const testLine = currentLine ? `${currentLine} ${segment}` : segment

    if (Jimp.measureText(font, testLine) <= width) {
      currentLine = testLine
    } else {
      wrappedText.push(currentLine.trim())
      currentLine = segment
    }
  }

  if (currentLine.trim()) {
    wrappedText.push(currentLine.trim())
  }

  return wrappedText
}

function cleanUploadsFolder() {
  const uploadsDir = path.join(__dirname, 'uploads')
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error('Error reading uploads folder:', err)
      return
    }
    files.forEach((file) => {
      const filePath = path.join(uploadsDir, file)
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting file:', filePath, err)
        } else {
          console.log('Deleted file:', filePath)
        }
      })
    })
  })
}

app.post('/generate', upload.single('profile'), async (req, res) => {
  const { name, text, time } = req.body
  const profilePicPath = req.file ? req.file.path : null

  if (!text || !name) {
    res.status(400).send('Invalid input: Name and text are required.')
    return
  }

  try {
    const uniqueFileName = await createImage(
      text,
      name,
      time || generateRandomTime(),
      profilePicPath
    )
    const outputPath = path.join(__dirname, uniqueFileName)

    res.download(outputPath, (err) => {
      if (err) {
        console.error('Error sending file:', err)
        res.status(500).send('Error downloading the file.')
      }

      if (profilePicPath && fs.existsSync(profilePicPath)) {
        fs.unlinkSync(profilePicPath)
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath)
      }
    })
  } catch (error) {
    console.error('Error generating image:', error)
    res.status(500).send('An error occurred while generating the image.')
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server is running`)
})
