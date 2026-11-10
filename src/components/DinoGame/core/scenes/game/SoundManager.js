import CONFIG from '../../config/game';
import { isSoundMuted } from '../../../../../utils/soundManager';

/**
 * Sound manager
 * @class SoundManager
 */
class SoundManager {
  /**
   * Creates an instance of SoundManager.
   * @param {Phaser.Scene} scene - The Scene to which this SoundManager belongs
   */
  constructor(scene) {
    this.scene = scene;

    this.playerAction = scene.sound.add('player-action');
    this.achievement = scene.sound.add('achievement');
    this.gameover = scene.sound.add('gameover');

    // Register event handlers
    scene.events.on(CONFIG.EVENTS.PLAYER_ACTION, this.playPlayerAction, this);
    scene.events.on(CONFIG.EVENTS.ACHIEVEMENT, this.playAchievement, this);
    scene.events.on(CONFIG.EVENTS.GAME_OVER, this.playGameOver, this);
  }

  /**
   * Play player action sound
   */
  playPlayerAction() {
    if (!isSoundMuted()) this.playerAction.play();
  }

  /**
   * Play achievement sound
   */
  playAchievement() {
    if (!isSoundMuted()) this.achievement.play();
  }

  /**
   * Play gameover sound
   */
  playGameOver() {
    if (this.scene.suppressGameOverSound) {
      this.scene.suppressGameOverSound = false;
      return;
    }
    if (!isSoundMuted()) this.gameover.play();
  }
}

export default SoundManager;
