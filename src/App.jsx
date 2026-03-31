import { useEffect, useMemo, useRef, useState } from 'react'
import hurtImg from './assets/hurt.png'
import bandageImg from './assets/bandage.png'
import hospitalSound from './assets/sounds/hospital.mp3'
import bandagePopSound from './assets/sounds/bandage_pop.mp3'
import flatlineSound from './assets/sounds/flatline.mp3'
import clickSound from './assets/sounds/click.mp3'
import lifelineSound from './assets/sounds/lifeline.mp3'
import yaySound from './assets/sounds/yay.mp3'
import './App.css'

const TOTAL_DAYS = 7
const PATIENTS_PER_DAY = 3
const QUESTIONS_PER_PATIENT = 11
const DAY_GOAL = PATIENTS_PER_DAY * QUESTIONS_PER_PATIENT
const START_LIFELINE = 100
const LIFELINE_DRAIN_PER_TICK = 0.9
const TICK_MS = 320
const MAX_OPERATION_SECONDS = Math.ceil(
  (START_LIFELINE / LIFELINE_DRAIN_PER_TICK) * (TICK_MS / 1000),
)

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const sickPatientModules = import.meta.glob('./assets/patients/*.png', {
  eager: true,
  import: 'default',
})

const happyPatientModules = import.meta.glob('./assets/patients/happy/*.png', {
  eager: true,
  import: 'default',
})

const bodyPartModules = import.meta.glob('./assets/patients/bodies/*/*.png', {
  eager: true,
  import: 'default',
})

const PATIENT_DIMS = {
  bingo_turn: { width: 788, height: 1028 },
  bluey_turn: { width: 554, height: 1346 },
  rumi_turn: { width: 544, height: 1362 },
  sleeping_beauty_turned: { width: 1118, height: 784 },
}

const BODY_ZONE = {
  bingo_turn: { xMin: 0.2, xMax: 0.82, yMin: 0.28, yMax: 0.78 },
  bluey_turn: { xMin: 0.2, xMax: 0.8, yMin: 0.3, yMax: 0.8 },
  rumi_turn: { xMin: 0.2, xMax: 0.82, yMin: 0.3, yMax: 0.8 },
  sleeping_beauty_turned: { xMin: 0.18, xMax: 0.82, yMin: 0.28, yMax: 0.72 },
}

const PATIENT_NAMES = {
  bingo_turn: 'Bingo',
  bluey_turn: 'Bluey',
  rumi_turn: 'Rumi',
  sleeping_beauty_turned: 'Belle',
}

const BODY_SET_NAMES = {
  bingo_body: 'Bingo Body Build',
  bluey_body: 'Bluey Body Build',
  guy_body: 'Body Build',
}

const BODY_PART_ORDER = [
  'body',
  'head',
  'chest',
  'hip',
  'snout',
  'tail',
  'left_ear',
  'right_ear',
  'left_ear_ned_to_flip',
  'right_ear_ned_to_flip',
  'left_eye',
  'eye_left',
  'right_eye',
  'eye_right',
  'left_arm',
  'right_arm',
  'left_leg',
  'right_leg',
  'left_foot',
  'right_lef',
]

const slugFromPath = (path) =>
  path
    .split('/')
    .pop()
    ?.replace(/\.png$/i, '')
    .toLowerCase() ?? ''

const sickPatients = Object.entries(sickPatientModules)
  .filter(([path]) => !path.includes('/happy/'))
  .map(([path, src]) => {
    const slug = slugFromPath(path)
    const rotateClockwise = slug.includes('turn') && !slug.includes('turned')

    return {
      slug,
      name: PATIENT_NAMES[slug] ?? slug,
      src,
      rotateClockwise,
      dimensions: PATIENT_DIMS[slug],
      bodyZone: BODY_ZONE[slug],
    }
  })

const happyPatients = Object.entries(happyPatientModules).map(([path, src]) => {
  const slug = slugFromPath(path)
  return {
    slug,
    src,
  }
})

const bodySetsMap = Object.entries(bodyPartModules).reduce((sets, [path, src]) => {
  const segments = path.split('/')
  const folder = segments[segments.length - 2]
  const slug = slugFromPath(path)

  if (!sets[folder]) {
    sets[folder] = {
      slug: folder,
      name: BODY_SET_NAMES[folder] ?? folder.replace(/_/g, ' '),
      baseSrc: null,
      parts: [],
    }
  }

  if (slug === 'body') {
    sets[folder].baseSrc = src
  } else {
    sets[folder].parts.push({
      id: `${folder}-${slug}`,
      slug,
      src,
      label: slug.replace(/_/g, ' '),
      flipHorizontal: folder === 'bingo_body' && slug === 'right_ear_ned_to_flip',
      shiftRight: folder === 'bingo_body' && slug === 'right_ear_ned_to_flip',
    })
  }

  return sets
}, {})

const bodySets = Object.values(bodySetsMap).map((set) => ({
  ...set,
  parts: [...set.parts].sort((left, right) => {
    const a = BODY_PART_ORDER.indexOf(left.slug)
    const b = BODY_PART_ORDER.indexOf(right.slug)
    return (a === -1 ? BODY_PART_ORDER.length : a) - (b === -1 ? BODY_PART_ORDER.length : b)
  }),
}))

const getHappyForSickSlug = (sickSlug) => {
  const map = {
    bingo_turn: 'bingo_happy',
    bluey_turn: 'bluey_happy',
    rumi_turn: 'rumi_happy',
    sleeping_beauty_turned: 'belle_happy',
  }

  const happySlug = map[sickSlug]
  return happyPatients.find((p) => p.slug === happySlug)?.src ?? null
}

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5)

const containerAspect = 16 / 10

const fitRectPercent = (patient) => {
  const dimensions = patient?.dimensions ?? { width: 1000, height: 1000 }
  const sourceW = patient?.rotateClockwise ? dimensions.height : dimensions.width
  const sourceH = patient?.rotateClockwise ? dimensions.width : dimensions.height
  const imageAspect = sourceW / sourceH

  if (imageAspect > containerAspect) {
    const heightPct = (containerAspect / imageAspect) * 100
    return { left: 0, top: (100 - heightPct) / 2, width: 100, height: heightPct }
  }

  const widthPct = (imageAspect / containerAspect) * 100
  return { left: (100 - widthPct) / 2, top: 0, width: widthPct, height: 100 }
}

const makeSpotsForPatient = (patient, count = QUESTIONS_PER_PATIENT) => {
  const zone = patient?.bodyZone ?? { xMin: 0.2, xMax: 0.8, yMin: 0.3, yMax: 0.78 }
  const fit = fitRectPercent(patient)
  const spots = []

  for (let id = 0; id < count; id += 1) {
    let attempt = 0
    let nextX = 50
    let nextY = 50

    while (attempt < 35) {
      const bodyX = zone.xMin + Math.random() * (zone.xMax - zone.xMin)
      const bodyY = zone.yMin + Math.random() * (zone.yMax - zone.yMin)

      nextX = fit.left + bodyX * fit.width
      nextY = fit.top + bodyY * fit.height

      const tooClose = spots.some((spot) => {
        const dx = spot.x - nextX
        const dy = spot.y - nextY
        return Math.hypot(dx, dy) < 8
      })

      if (!tooClose) {
        break
      }

      attempt += 1
    }

    spots.push({ id, x: nextX, y: nextY, fixed: false })
  }

  return spots
}

const makePool = (multipliers) => {
  const pool = []
  for (const a of multipliers) {
    for (let b = 1; b <= 10; b++) {
      pool.push({ a, b })
    }
  }
  return pool
}

const POOL_1_2_10   = makePool([1, 2, 10])
const POOL_3        = makePool([3])
const POOL_4        = makePool([4])
const POOL_3_4      = makePool([3, 4])
const POOL_1_2_10_3 = makePool([1, 2, 10, 3])

// Per-day, per-stage question pools  [stage0, stage1, stage2]
const DAY_STAGE_POOLS = [
  [POOL_1_2_10,   POOL_3,      POOL_1_2_10_3], // Day 1
  [POOL_1_2_10,   POOL_3,      POOL_1_2_10_3], // Day 2
  [POOL_3,        POOL_4,      POOL_3_4],       // Day 3
  [POOL_3,        POOL_4,      POOL_3_4],       // Day 4
  [POOL_3_4,      POOL_1_2_10, POOL_3_4],       // Day 5
  [POOL_3_4,      POOL_1_2_10, POOL_3_4],       // Day 6
  [POOL_3_4,      POOL_1_2_10, POOL_3_4],       // Day 7
]

const makeQuestion = (pool) => {
  const entry = pool[Math.floor(Math.random() * pool.length)]
  const { a, b } = entry
  return {
    a,
    b,
    prompt: `${a} x ${b}`,
    answer: a * b,
  }
}

const formatDuration = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const makeStages = (dayIndex = 0) => {
  const selectedPatients = shuffle(sickPatients).slice(0, 2)
  const selectedBodySet = shuffle(bodySets)[0]
  const pools = DAY_STAGE_POOLS[dayIndex] ?? DAY_STAGE_POOLS[0]

  return [
    {
      kind: 'bandage',
      patient: selectedPatients[0],
      questionCount: QUESTIONS_PER_PATIENT,
      questionPool: pools[0],
    },
    {
      kind: 'body',
      bodySet: selectedBodySet,
      questionCount: selectedBodySet?.parts.length ?? 7,
      questionPool: pools[1],
    },
    {
      kind: 'bandage',
      patient: selectedPatients[1],
      questionCount: QUESTIONS_PER_PATIENT,
      questionPool: pools[2],
    },
  ]
}

const makeStageRuntime = (stage) => ({
  patientSpots:
    stage?.kind === 'bandage'
      ? makeSpotsForPatient(stage.patient, stage.questionCount)
      : [],
  placedParts: [],
  activeSlidePartId: null,
})

const makeOperationState = (dayIndex = 0) => {
  const stages = makeStages(dayIndex)
  const firstRuntime = makeStageRuntime(stages[0])

  return {
    phase: 'intro',
    stages,
    patientIndex: 0,
    startedAt: Date.now(),
    completedAt: null,
    lifeline: START_LIFELINE,
    failed: false,
    dayFinished: false,
    totalAnswered: 0,
    totalCorrect: 0,
    stageStartAnswered: 0,
    stageStartCorrect: 0,
    dayGoal: stages.reduce((total, stage) => total + stage.questionCount, 0),
    patientQuestionCount: 0,
    patientSpots: firstRuntime.patientSpots,
    placedParts: firstRuntime.placedParts,
    activeSlidePartId: firstRuntime.activeSlidePartId,
    question: makeQuestion(stages[0].questionPool),
  }
}

const makeDayState = () =>
  Array.from({ length: TOTAL_DAYS }, () => ({
    correct: 0,
    attempts: 0,
    careSessions: 0,
    goal: DAY_GOAL,
    finishTimeSec: null,
    completed: false,
  }))

function App() {
  const [days, setDays] = useState(() => {
    const saved = localStorage.getItem('hospital-days-v1')
    if (!saved) {
      return makeDayState()
    }

    try {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) && parsed.length === TOTAL_DAYS
        ? parsed
        : makeDayState()
    } catch {
      return makeDayState()
    }
  })

  const [selectedDay, setSelectedDay] = useState(null)
  const [operation, setOperation] = useState(null)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackType, setFeedbackType] = useState('neutral')
  const [showDayWin, setShowDayWin] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const operationStartTimeRef = useRef(null)

  const hospitalAudio = useRef(null)
  const lifelineAudio = useRef(null)
  const bandagePopAudio = useRef(null)
  const flatlineAudio = useRef(null)
  const clickAudio = useRef(null)
  const yayAudio = useRef(null)

  const activeDay = selectedDay === null ? null : days[selectedDay]

  useEffect(() => {
    localStorage.setItem('hospital-days-v1', JSON.stringify(days))
  }, [days])

  // Initialise audio objects once and attach global click-sound listener
  useEffect(() => {
    hospitalAudio.current = new Audio(hospitalSound)
    hospitalAudio.current.loop = true
    hospitalAudio.current.volume = 0.35

    lifelineAudio.current = new Audio(lifelineSound)
    lifelineAudio.current.loop = true
    lifelineAudio.current.volume = 0.18

    bandagePopAudio.current = new Audio(bandagePopSound)
    bandagePopAudio.current.volume = 0.85

    flatlineAudio.current = new Audio(flatlineSound)
    flatlineAudio.current.volume = 0.9

    clickAudio.current = new Audio(clickSound)
    clickAudio.current.volume = 0.5

    yayAudio.current = new Audio(yaySound)
    yayAudio.current.volume = 0.85

    const handleGlobalClick = (e) => {
      if (e.target.closest('button')) {
        if (clickAudio.current) {
          clickAudio.current.currentTime = 0
          clickAudio.current.play().catch(() => {})
        }
      }
    }

    document.addEventListener('click', handleGlobalClick)
    return () => {
      document.removeEventListener('click', handleGlobalClick)
      hospitalAudio.current?.pause()
      lifelineAudio.current?.pause()
    }
  }, [])

  // Play/stop looping lifeline sound while operating
  useEffect(() => {
    if (!operation) {
      lifelineAudio.current?.pause()
      return
    }
    if (operation.phase === 'operating' && !operation.failed) {
      lifelineAudio.current?.play().catch(() => {})
    } else {
      lifelineAudio.current?.pause()
    }
  }, [operation?.phase, operation?.failed])

  // Stop hospital BG when day is fully complete
  useEffect(() => {
    if (operation?.phase === 'complete') {
      hospitalAudio.current?.pause()
      if (hospitalAudio.current) hospitalAudio.current.currentTime = 0
    }
  }, [operation?.phase])

  useEffect(() => {
    if (operation?.phase === 'cured' && yayAudio.current) {
      yayAudio.current.currentTime = 0
      yayAudio.current.play().catch(() => {})
    }
  }, [operation?.phase])

  useEffect(() => {
    if (!operation?.activeSlidePartId) {
      return
    }

    const timeout = window.setTimeout(() => {
      setOperation((current) => {
        if (!current || current.activeSlidePartId !== operation.activeSlidePartId) {
          return current
        }

        return {
          ...current,
          activeSlidePartId: null,
        }
      })
    }, 650)

    return () => window.clearTimeout(timeout)
  }, [operation?.activeSlidePartId])

  const progressPct = useMemo(() => {
    if (!activeDay) {
      return 0
    }
    const goal = operation?.dayGoal ?? activeDay.goal ?? DAY_GOAL
    return Math.min(100, Math.round((activeDay.correct / goal) * 100))
  }, [activeDay, operation?.dayGoal])

  useEffect(() => {
    if (!operation || operation.phase !== 'operating' || operation.failed) {
      return
    }

    const timer = window.setInterval(() => {
      setOperation((current) => {
        if (!current || current.phase !== 'operating' || current.failed) {
          return current
        }

        const nextLifeline = Math.max(0, current.lifeline - LIFELINE_DRAIN_PER_TICK)

        if (nextLifeline <= 0) {
          return {
            ...current,
            lifeline: 0,
            failed: true,
          }
        }

        return {
          ...current,
          lifeline: nextLifeline,
        }
      })
    }, TICK_MS)

    return () => window.clearInterval(timer)
  }, [operation])

  useEffect(() => {
    if (operation?.failed) {
      lifelineAudio.current?.pause()
      if (flatlineAudio.current) {
        flatlineAudio.current.currentTime = 0
        flatlineAudio.current.play().catch(() => {})
      }
      setFeedback('Lifeline reached zero. Restart this set and try again!')
      setFeedbackType('error')
    }
  }, [operation?.failed])

  const startDay = (dayIndex) => {
    setSelectedDay(dayIndex)
    setOperation(makeOperationState(dayIndex))
    setFeedback('')
    setFeedbackType('neutral')
    setAnswer('')
    setShowDayWin(false)
    setElapsedSeconds(0)
    operationStartTimeRef.current = null
    if (hospitalAudio.current) {
      hospitalAudio.current.currentTime = 0
      hospitalAudio.current.play().catch(() => {})
    }
  }

  const goHome = () => {
    // Save completion time if day was finished
    if (operation && operation.phase === 'complete' && selectedDay !== null) {
      setDays((currentDays) => {
        const nextDays = [...currentDays]
        const current = nextDays[selectedDay]
        
        nextDays[selectedDay] = {
          ...current,
          attempts: operation.totalAnswered,
          correct: operation.totalCorrect,
          goal: operation.dayGoal,
          careSessions: operation.patientIndex + 1,
          finishTimeSec: Math.max(1, elapsedSeconds),
          completed: true,
        }
        return nextDays
      })
    }
    
    setSelectedDay(null)
    setFeedback('')
    setFeedbackType('neutral')
    setAnswer('')
    setOperation(null)
    setElapsedSeconds(0)
    operationStartTimeRef.current = null
    setShowDayWin(false)
    hospitalAudio.current?.pause()
    if (hospitalAudio.current) hospitalAudio.current.currentTime = 0
    lifelineAudio.current?.pause()
  }

  const startOperation = () => {
    setOperation((current) => {
      if (!current || current.phase !== 'intro') {
        return current
      }

      return {
        ...current,
        phase: 'operating',
      }
    })

    setFeedback('Operation started. Keep the lifeline alive!')
    setFeedbackType('neutral')
  }

  const restartOperation = () => {
    if (selectedDay === null) {
      return
    }

    setOperation((current) => {
      if (!current) {
        return makeOperationState(selectedDay)
      }

      const currentStage = current.stages[current.patientIndex]
      const runtime = makeStageRuntime(currentStage)

      return {
        ...current,
        phase: 'intro',
        failed: false,
        lifeline: START_LIFELINE,
        totalAnswered: current.stageStartAnswered,
        totalCorrect: current.stageStartCorrect,
        patientQuestionCount: 0,
        patientSpots: runtime.patientSpots,
        placedParts: runtime.placedParts,
        activeSlidePartId: runtime.activeSlidePartId,
        question: makeQuestion(currentStage.questionPool),
      }
    })

    setAnswer('')
    setFeedback('Set restarted. You can do it!')
    setFeedbackType('neutral')
  }

  const goToNextPatient = () => {
    setOperation((current) => {
      if (!current || current.phase !== 'cured') {
        return current
      }

      const nextPatientIndex = current.patientIndex + 1
      const nextStage = current.stages[nextPatientIndex]

      if (!nextStage) {
        return {
          ...current,
          phase: 'complete',
          completedAt: Date.now(),
          dayFinished: true,
        }
      }

      const nextRuntime = makeStageRuntime(nextStage)

      return {
        ...current,
        phase: 'intro',
        patientIndex: nextPatientIndex,
        lifeline: START_LIFELINE,
        stageStartAnswered: current.totalAnswered,
        stageStartCorrect: current.totalCorrect,
        patientQuestionCount: 0,
        patientSpots: nextRuntime.patientSpots,
        placedParts: nextRuntime.placedParts,
        activeSlidePartId: nextRuntime.activeSlidePartId,
        question: makeQuestion(currentStage.questionPool),
      }
    })

    setFeedback('Next round ready. Press start when you are ready.')
    setFeedbackType('neutral')
  }

  const submitOperationAnswer = (event) => {
    event.preventDefault()

    if (!operation || operation.phase !== 'operating' || operation.failed) {
      return
    }

    const numeric = Number(answer)
    const isCorrect = numeric === operation.question.answer

    setOperation((current) => {
      if (!current || current.phase !== 'operating' || current.failed) {
        return current
      }

      const currentStage = current.stages[current.patientIndex]
      const answeredForPatient = current.patientQuestionCount + (isCorrect ? 1 : 0)
      const answeredTotal = current.totalAnswered + 1
      const stageGoal = currentStage.questionCount

      if (!isCorrect) {
        return {
          ...current,
          totalAnswered: answeredTotal,
        }
      }

      if (currentStage.kind === 'body') {
        const nextPart = currentStage.bodySet.parts[current.patientQuestionCount]
        const nextPlacedParts = nextPart
          ? [...current.placedParts, nextPart]
          : current.placedParts

        if (answeredForPatient >= stageGoal) {
          return {
            ...current,
            phase: 'cured',
            totalAnswered: answeredTotal,
            totalCorrect: current.totalCorrect + 1,
            patientQuestionCount: answeredForPatient,
            placedParts: nextPlacedParts,
            activeSlidePartId: nextPart?.id ?? null,
          }
        }

        return {
          ...current,
          totalAnswered: answeredTotal,
          totalCorrect: current.totalCorrect + 1,
          patientQuestionCount: answeredForPatient,
          placedParts: nextPlacedParts,
          activeSlidePartId: nextPart?.id ?? null,
          question: makeQuestion(currentStage.questionPool),
        }
      }

      const activeSpot = current.patientSpots.find((spot) => !spot.fixed)
      const nextSpots = current.patientSpots.map((spot) =>
        activeSpot && spot.id === activeSpot.id ? { ...spot, fixed: true } : spot,
      )

      if (answeredForPatient >= stageGoal) {
        return {
          ...current,
          phase: 'cured',
          totalAnswered: answeredTotal,
          totalCorrect: current.totalCorrect + 1,
          patientQuestionCount: answeredForPatient,
          patientSpots: nextSpots,
        }
      }

      return {
        ...current,
        totalAnswered: answeredTotal,
        totalCorrect: current.totalCorrect + 1,
        patientQuestionCount: answeredForPatient,
        patientSpots: nextSpots,
        question: makeQuestion(currentStage.questionPool),
      }
    })

    if (isCorrect && bandagePopAudio.current) {
      bandagePopAudio.current.currentTime = 0
      bandagePopAudio.current.play().catch(() => {})
    }

    setFeedback(
      isCorrect
        ? operation.stages[operation.patientIndex]?.kind === 'body'
          ? 'Correct! A body part slid into place.'
          : 'Correct! Great bandage placement.'
        : 'Incorrect. Try the same question again.',
    )
    setFeedbackType(isCorrect ? 'success' : 'error')
    setAnswer('')
  }

  const submitAnswer = (event) => {
    event.preventDefault()
    if (selectedDay === null || !activeDay || !operation) {
      return
    }

    if (operation.phase === 'operating') {
      submitOperationAnswer(event)
      return
    }

    return
  }

  useEffect(() => {
    if (!operation || selectedDay === null) {
      return
    }

    setDays((currentDays) => {
      const nextDays = [...currentDays]
      const current = nextDays[selectedDay]

      nextDays[selectedDay] = {
        ...current,
        attempts: operation.totalAnswered,
        correct: operation.totalCorrect,
        goal: operation.dayGoal,
        careSessions: operation.patientIndex + (operation.phase === 'complete' ? 1 : 0),
        finishTimeSec:
          operation.phase === 'complete' && operation.startedAt && operation.completedAt
            ? Math.max(1, Math.round((operation.completedAt - operation.startedAt) / 1000))
            : current.finishTimeSec,
        completed: operation.phase === 'complete',
      }

      return nextDays
    })

    if (operation.phase === 'complete') {
      setShowDayWin(true)
      setFeedback('Amazing work! You finished all rounds today.')
      setFeedbackType('success')
    }
  }, [operation, selectedDay])

  const currentStage = operation?.stages?.[operation.patientIndex] ?? null
  const currentPatient = currentStage?.kind === 'bandage' ? currentStage.patient : null
  const currentBodySet = currentStage?.kind === 'body' ? currentStage.bodySet : null
  const currentPatientHappy = currentPatient
    ? getHappyForSickSlug(currentPatient.slug)
    : null

  const patientProgressText = operation
    ? `${Math.min(operation.patientQuestionCount, currentStage?.questionCount ?? QUESTIONS_PER_PATIENT)} / ${currentStage?.questionCount ?? QUESTIONS_PER_PATIENT}`
    : `0 / ${QUESTIONS_PER_PATIENT}`

  // Timer effect: only counts during operating phase (answering questions)
  // Pauses during intro (instructions) and cured (happy patient) phases
  useEffect(() => {
    if (!operation) {
      setElapsedSeconds(0)
      operationStartTimeRef.current = null
      return
    }

    // Stop timer on complete phase
    if (operation.phase === 'complete') {
      return
    }

    // Pause timer during intro (instructions) and cured phases
    if (operation.phase === 'intro' || operation.phase === 'cured') {
      return
    }

    // Capture start time when first entering operating phase
    if (!operationStartTimeRef.current) {
      operationStartTimeRef.current = Date.now()
    }

    // Update elapsed time every second during operating phase only
    const interval = setInterval(() => {
      if (operationStartTimeRef.current && operation.phase === 'operating') {
        const elapsed = Math.floor((Date.now() - operationStartTimeRef.current) / 1000)
        setElapsedSeconds(elapsed)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [operation?.phase])

  const timerText = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(
    elapsedSeconds % 60,
  ).padStart(2, '0')}`

  return (
    <div className="app-shell">
      {selectedDay === null && (
        <header className="hero-banner">
          <p className="eyebrow">Math Doctor Game</p>
          <h1>Help Patients With Times Tables</h1>
          <p>
            Pick a day, answer math questions, and help each patient feel better.
          </p>
        </header>
      )}

      {selectedDay === null ? (
        <main className="home-view">
          <h2>Choose A Day</h2>
          <p className="subtitle">Tap a day to start your hospital mission.</p>

          <div className="day-grid">
            {days.map((day, index) => {
              const isDayLocked = index > 0 && !days[index - 1].completed
              return (
                <button
                  key={`day-${index + 1}`}
                  className={`day-card ${day.completed ? 'done' : ''} ${isDayLocked ? 'locked' : ''}`}
                  onClick={() => !isDayLocked && startDay(index)}
                  disabled={isDayLocked}
                >
                  <span className="day-title">Day {index + 1}</span>
                  <span className="day-stats">{day.correct}/{day.goal ?? DAY_GOAL} correct</span>
                  {day.finishTimeSec && (
                    <span className="day-time">Time: {formatDuration(day.finishTimeSec)}</span>
                  )}
                </button>
              )
            })}
          </div>
        </main>
      ) : (
        <main className="game-view">
          <div className="top-row">
            <button className="back-btn" onClick={goHome}>
              Back To Days
            </button>
            <div className="top-right-group">
              <p className="day-chip">Day {selectedDay + 1}</p>
              <p className="timer-chip">Time: {timerText}</p>
            </div>
          </div>

          <section className="progress-card">
            <div>
              <h2>Operation Progress</h2>
              <p>
                {activeDay.correct} / {operation?.dayGoal ?? activeDay.goal ?? DAY_GOAL} questions done today
              </p>
            </div>
            <div className="bar-wrap" aria-hidden="true">
              <div className="bar-fill" style={{ width: `${progressPct}%` }}></div>
            </div>
          </section>

          {showDayWin && operation?.phase !== 'complete' && (
            <section className="win-card" role="status" aria-live="polite">
              <h3>Day Complete!</h3>
              <p>You finished the bandage rounds and the body build round.</p>
            </section>
          )}

          {operation?.failed && (
            <section className="care-card">
              <h3>Emergency Alert</h3>
              <p>Time ran out. Press restart and try again.</p>
              <button className="resume-btn" onClick={restartOperation}>
                Restart Operation
              </button>
            </section>
          )}

          {operation && !operation.failed && operation.phase === 'intro' && currentPatient && (
            <section className="care-card">
              <h3>
                Round {operation.patientIndex + 1}: {currentPatient.name}
              </h3>
              <p>
                Answer {QUESTIONS_PER_PATIENT} questions to heal all hurt spots.
              </p>
              <button className="resume-btn action-top" onClick={startOperation}>
                Start Operation
              </button>
              <div className="patient-zone">
                <img
                  src={currentPatient.src}
                  alt={currentPatient.name}
                  className={`patient-photo ${currentPatient.rotateClockwise ? 'rotate-cw' : ''}`}
                />
                {operation.patientSpots.map((spot) => (
                  <div
                    key={spot.id}
                    className="spot-btn bandage"
                    style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                  >
                    <img src={hurtImg} alt="Hurt spot" className="wound-marker" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {operation && !operation.failed && operation.phase === 'intro' && currentBodySet && (
            <section className="care-card">
              <h3>Round {operation.patientIndex + 1}: {currentBodySet.name}</h3>
              <p>Answer {currentBodySet.questionCount} questions to build the body.</p>
              <button className="resume-btn action-top" onClick={startOperation}>
                Start Build
              </button>
              <div className="body-build-scene">
                <div className="assembly-board intro-board">
                  {currentBodySet.baseSrc ? (
                    <img src={currentBodySet.baseSrc} alt={currentBodySet.name} className="assembly-layer base" />
                  ) : (
                    <div className="assembly-placeholder">Build Here</div>
                  )}
                </div>
                <div className="parts-pile">
                  {currentBodySet.parts.map((part, index) => (
                    <img
                      key={part.id}
                      src={part.src}
                      alt={part.label}
                      className={`pile-part tilt-${index % 4} ${
                        part.flipHorizontal ? 'flip-horizontal' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {operation && !operation.failed && operation.phase === 'operating' && currentStage?.kind === 'bandage' && currentPatient && (
            <section className="care-card">
              <h3>
                Operating On {currentPatient.name}
              </h3>
              <p>Question {patientProgressText} for this patient</p>

              <p className={`question-big ${feedbackType === 'error' ? 'error' : ''}`} aria-live="polite">
                {operation.question.prompt} = ?
              </p>

              <form className="bandage-form" onSubmit={submitAnswer}>
                <label htmlFor="op-answer">Type your answer</label>
                <div className="bandage-input-row">
                  <input
                    id="op-answer"
                    type="number"
                    min="0"
                    required
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Enter answer"
                  />
                  <button type="submit">Submit</button>
                </div>
              </form>

              {feedback && (
                <p className={`inline-feedback ${feedbackType}`} role="status" aria-live="polite">
                  {feedback}
                </p>
              )}

              <div className="lifeline-wrap" aria-live="polite">
                <div className="lifeline-label-row">
                  <strong>Patient Lifeline</strong>
                  <span>{Math.round(operation.lifeline)}%</span>
                </div>
                <div className="lifeline-track" aria-hidden="true">
                  <div
                    className={`lifeline-fill ${operation.lifeline < 35 ? 'danger' : ''}`}
                    style={{ width: `${operation.lifeline}%` }}
                  ></div>
                </div>
              </div>

              <div className="patient-zone">
                <img
                  src={currentPatient.src}
                  alt={currentPatient.name}
                  className={`patient-photo ${currentPatient.rotateClockwise ? 'rotate-cw' : ''}`}
                />
                {operation.patientSpots.map((spot) => (
                  <div
                    key={spot.id}
                    className={`spot-btn bandage ${spot.fixed ? 'fixed' : ''} ${
                      !spot.fixed &&
                      spot.id === operation.patientSpots.find((item) => !item.fixed)?.id
                        ? 'target'
                        : ''
                    }`}
                    style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                  >
                    {spot.fixed ? (
                      <img src={bandageImg} alt="Bandaged spot" className="wound-marker" />
                    ) : (
                      <img src={hurtImg} alt="Hurt spot" className="wound-marker" />
                    )}
                  </div>
                ))}
              </div>

              <p className="bottom-instruction">
                Tip: Work fast. The lifeline keeps going down until all 11 are done.
              </p>
            </section>
          )}

          {operation && !operation.failed && operation.phase === 'operating' && currentStage?.kind === 'body' && currentBodySet && (
            <section className="care-card">
              <h3>Building The Body</h3>
              <p>Question {patientProgressText} for this body build</p>

              <p className={`question-big ${feedbackType === 'error' ? 'error' : ''}`} aria-live="polite">
                {operation.question.prompt} = ?
              </p>

              <form className="bandage-form" onSubmit={submitAnswer}>
                <label htmlFor="op-answer">Type your answer</label>
                <div className="bandage-input-row">
                  <input
                    id="op-answer"
                    type="number"
                    min="0"
                    required
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Enter answer"
                  />
                  <button type="submit">Submit</button>
                </div>
              </form>

              {feedback && (
                <p className={`inline-feedback ${feedbackType}`} role="status" aria-live="polite">
                  {feedback}
                </p>
              )}

              <div className="lifeline-wrap" aria-live="polite">
                <div className="lifeline-label-row">
                  <strong>Patient Lifeline</strong>
                  <span>{Math.round(operation.lifeline)}%</span>
                </div>
                <div className="lifeline-track" aria-hidden="true">
                  <div
                    className={`lifeline-fill ${operation.lifeline < 35 ? 'danger' : ''}`}
                    style={{ width: `${operation.lifeline}%` }}
                  ></div>
                </div>
              </div>

              <div className="body-build-scene">
                <div className="assembly-board">
                  {currentBodySet.baseSrc ? (
                    <img src={currentBodySet.baseSrc} alt={currentBodySet.name} className="assembly-layer base" />
                  ) : (
                    <div className="assembly-placeholder">Build Here</div>
                  )}
                  {operation.placedParts.map((part) => (
                    <img
                      key={part.id}
                      src={part.src}
                      alt={part.label}
                      className={`assembly-layer ${
                        operation.activeSlidePartId === part.id ? 'slide-in' : ''
                      } ${part.flipHorizontal ? 'flip-horizontal' : ''} ${
                        part.shiftRight ? 'shift-right' : ''
                      }`}
                    />
                  ))}
                </div>

                <div className="parts-pile">
                  {currentBodySet.parts
                    .filter(
                      (part) => !operation.placedParts.some((placed) => placed.id === part.id),
                    )
                    .map((part, index) => (
                      <img
                        key={part.id}
                        src={part.src}
                        alt={part.label}
                        className={`pile-part tilt-${index % 4} ${
                          part.flipHorizontal ? 'flip-horizontal' : ''
                        }`}
                      />
                    ))}
                </div>
              </div>

              <p className="bottom-instruction">
                Tip: Each right answer adds the next body part.
              </p>
            </section>
          )}

          {operation && !operation.failed && operation.phase === 'cured' && currentPatient && (
            <section className="care-card">
              <h3>{currentPatient.name} Is Cured!</h3>
              <p>Great work! Ready for the next patient?</p>
              <button className="resume-btn action-top" onClick={goToNextPatient}>
                {operation.patientIndex + 1 < PATIENTS_PER_DAY
                  ? 'Next Round →'
                  : 'Finish Day →'}
              </button>
              <div className="patient-zone cured-zone">
                {currentPatientHappy ? (
                  <img src={currentPatientHappy} alt={`${currentPatient.name} happy`} className="patient-photo" />
                ) : (
                  <img
                    src={currentPatient.src}
                    alt={currentPatient.name}
                    className={`patient-photo ${currentPatient.rotateClockwise ? 'rotate-cw' : ''}`}
                  />
                )}
                <div className="cured-tag">Cured!</div>
              </div>
            </section>
          )}

          {operation && !operation.failed && operation.phase === 'cured' && currentBodySet && (
            <section className="care-card">
              <h3>Body Complete!</h3>
              <p>Great work! The body is all back together.</p>
              <button className="resume-btn action-top" onClick={goToNextPatient}>
                {operation.patientIndex + 1 < PATIENTS_PER_DAY
                  ? 'Next Round →'
                  : 'Finish Day →'}
              </button>
              <div className="body-build-scene">
                <div className="assembly-board cured-board">
                  {currentBodySet.baseSrc ? (
                    <img src={currentBodySet.baseSrc} alt={currentBodySet.name} className="assembly-layer base" />
                  ) : (
                    <div className="assembly-placeholder">Built!</div>
                  )}
                  {currentBodySet.parts.map((part) => (
                    <img
                      key={part.id}
                      src={part.src}
                      alt={part.label}
                      className={`assembly-layer ${part.flipHorizontal ? 'flip-horizontal' : ''} ${
                        part.shiftRight ? 'shift-right' : ''
                      }`}
                    />
                  ))}
                </div>
                <div className="cured-tag">Built!</div>
              </div>
            </section>
          )}

          {operation && operation.phase === 'complete' && (
            <section className="care-card">
              <h3>Great Job Working A Day At Hospital</h3>
              <button className="resume-btn" onClick={goHome}>
                Back To Day Select
              </button>
            </section>
          )}

          {operation?.phase !== 'complete' && (
            <p className={`feedback ${feedbackType}`} role="status" aria-live="polite">
              {feedback}
            </p>
          )}
        </main>
      )}
    </div>
  )
}

export default App
