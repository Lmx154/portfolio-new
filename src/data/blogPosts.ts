export interface BlogPost {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  readTime: string;
  content: {
    sections: Array<{
      type: 'text' | 'heading' | 'image';
      content: string;
      alt?: string;
    }>;
  };
  tags: string[];
}

export const blogPosts: BlogPost[] = [
  {
    id: 'brunito-first-avionics-system',
    title: 'Brunito - The First Avionics System at the Rocket Launchers for Disparado',
    date: 'July 11, 2025',
    excerpt: 'The inspiring journey of developing Brunito, our contingency flight computer, amid trade disruptions and tight deadlines.',
    readTime: '10 min read',
    content: {
      sections: [
        {
          type: 'text',
          content: 'In early 2024, our avionics team, led by the talented Axel—an electrical engineer specializing in PCB design—created a promising flight computer named Bruno. Axel\'s expertise shone in the hardware layout, providing a strong foundation for our rocketry goals, though it was untested and he noted potential issues since embedded programming wasn\'t his domain. Despite our limited budget, we gathered funds and ordered the PCBs from JLC in February. Anticipation grew, but the US-China trade war in March 2025 blocked delivery, returning our shipment and leaving us hardware-less. Knowing Bruno might need tweaks, I proactively started on a backup: Brunito, our adaptive contingency flight computer.'
        },
        {
          type: 'text',
          content: 'Building on Bruno\'s dual MCU concept, I engineered Brunito with two STM32F401 Black Pills at its core. After in-depth research on avionics components, I incorporated essential sensors: BMI088 for accel/gyro, BMM150 for magnetic field, BMP280 for barometric data, u-blox MAX-M10S for GPS, LoRa RFM95W for comms, and an SD card for logging. Post-PCB expenditure, funds were scarce, so I procured most parts personally to sustain momentum. Pressed by the March Lonestar launch, we accelerated efforts. As our inaugural custom system, Brunito missed the cutoff, but it imparted key learnings in hardware integration, sensor management, and overall system building—foundations for future success.'
        },
        {
          type: 'image',
          content: '/brunito-proto.jpg',
          alt: 'Brunito prototype flight computer'
        },
        {
          type: 'text',
          content: 'After Lonestar\'s setback, enthusiasm waned without Bruno\'s arrival. I stayed driven, dedicating endless hours to Brunito\'s refinement—optimizing sensors, resolving hardware issues, and bolstering telemetry as the team\'s embedded/firmware specialist. This commitment sparked renewed interest; by late April, collaborators returned. With Axel gearing up for graduation, our avionics lead Diego spearheaded RF amplifier enhancements for superior LoRa performance and signal stability. Andrew, our software expert, honed his live telemetry parser, SENTINEL, to seamlessly handle Brunito\'s outputs. Inspired by my digital systems class on state machines, I rearchitected the firmware for clarity and efficiency, integrating RTOS for concurrent operations and DMA for streamlined data flow. This yielded an advanced setup with bidirectional telemetry, command processing, and reliable acknowledgments. For improved usability, I precisely resoldered components to minimize wiring and maximize space efficiency.'
        },
        {
          type: 'image',
          content: '/brunito.jpg',
          alt: 'Brunito flight computer after hardware rework'
        },
        {
          type: 'text',
          content: 'Entering summer, Brunito was refined but awaited full rocket integration. Teammates\' internships left me with three rigorous weeks for IREC prep. Coordinating with other subteams, we engineered a nose cone avionics bay for better safeguarding. I performed exhaustive vacuum tests to confirm sensor reliability in flight-like vacuums and calibrated servo responses. A standout innovation was the velocity-triggered payload release for cloud seeding, ensuring timely activation near peak altitude despite variables. Wiring the bay alone curtailed extensive checks, yet fundamentals like SD logging, two-way comms, and command confirms excelled. After two back-to-back all-nighters, aided by Jones on bay assembly, Brunito was competition-ready. A key summer course kept me from IREC, but I supplied thorough guides and virtual support.'
        },
        {
          type: 'image',
          content: '/brunitobay.jpg',
          alt: 'Brunito avionics bay fully assembled'
        },
        {
          type: 'text',
          content: 'Launch anticipation was palpable. Remotely, I helped troubleshoot firmware and dispatch commands. We secured live telemetry through apogee, probably interrupted by battery shift at drogue eject. A parachute snag resulted in a rough impact, dislodging Brunito and halting cloud seeding. Initial dismay turned to relief as the SD card was salvaged from the site. Analyzing it revealed comprehensive flight logs, offering deep performance insights. These experiences strengthened our collaboration and rocketry acumen, turning obstacles into stepping stones.'
        },
        {
          type: 'heading',
          content: 'Lessons Learned'
        },
        {
          type: 'text',
          content: 'Mitigate EMI via stacked, shielded boards for precise readings. Secure avionics in less exposed locations to withstand crashes. Mandate thorough subsystem testing. Opt for advanced radios for superior connectivity. These takeaways are fueling our path to enhanced achievements.'
        },
        {
          type: 'text',
          content: 'Thanks for joining our journey of determination and discovery!'
        },
        {
          type: 'image',
          content: '/avionics.jpg',
          alt: 'Avionics team 2024-2025'
        }
      ]
    },
    tags: ['Avionics', 'Flight Computer', 'STM32', 'Embedded Systems', 'RTOS', 'Rocket Launchers']
  }
];