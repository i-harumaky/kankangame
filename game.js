'use strict';
$(function() {

  // document.addEventListener('touchmove', function(e) {
  //   e.preventDefault()
  // }, { passive: false });
  var audio = $('audio');
  audio.prop('volume', 0);

  var dpr = devicePixelRatio;
  var canvas = document.getElementById('game-field');
  if (!canvas || !canvas.getContext) { return false };
  var ctx = canvas.getContext('2d');

  // コンテキストの初期値設定
  canvas.width = 300;
  canvas.height = 500;
  // 解像度が高かったら、コンテキストを拡大
  canvas.width *= dpr;
  canvas.height *= dpr;
  // 座標も全てdpr倍
  ctx.scale(dpr, dpr);
  // スタイルは拡大した分縮小
  canvas.style.width = String(canvas.width / dpr) + "px";
  canvas.style.height = String(canvas.height / dpr) + "px";

  var theBall, // ボールのインスタンス
      initBall, // ボールの初期Xランダム
      updateID, // 描画更新update()をコールバックするためのsetTimeout
      deadZone; // 下部のゲームアウト領域インスタンス
  var num = 10; // 一つのボックスのHP？の初期値
  var boxes = []; // ボックスのインスタンス格納配列
  var updateInterval = 8; // update()更新間隔8(ms)
  var score = 0;
  var playing = false;
  var theArrow; // アローのインスタンス

  var Ball = function(x, y) {
    this.x = x;
    this.y = y;
    this.vx;
    this.vy;
    this.r = 5; // 半径固定5
    this.draw = function() {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 0, 0, 1)';
      ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI, true);
      ctx.fill();
    }
    this.move = function() {
      this.x += this.vx;
      this.y += this.vy;
      // 右、左衝突
      if (this.x + this.r > canvas.width / dpr || this.x - this.r < 0) {
        this.vx *= -1;
      }
      // 上
      if (this.y - this.r < 0) { 
        this.vy *= -1;
      }
      // デットゾーン
      if (this.y >= 450) {
        finishGame();
      }
    }
  }

  // ボックス（ブロックにした方がよかったなと後悔）
  var Box = function(x, y, num, id) {
      this.x = x;
      this.y = y;
      this.num = num; // box内の数字
      this.id = id; // 任意のboxを削除する際に使う
      this.collisioned = false; // 衝突判定が出た場合true
      this.afterCollision = 0; // 衝突判定後の描画更新回数
      this.debugReflect = false;
  }
  // boxは何個も作られるからメソッドはプロトタイプチェーンで
  Box.prototype.determineColor = function() {
    if(this.collisioned && this.afterCollision < 20) {
      this.color = 'red'; // 衝突後、20回の間は背景redに
    } else {
      this.hue = this.num * 12 + 120; // numに応じて背景色設定
      this.color = `hsl(${this.hue}, 50%, 60%)`
      this.collisioned = false;
    }
  }
  Box.prototype.draw = function() {
    this.determineColor();
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, 30, 30);
    // 以下num表示を更新
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.num, this.x + 15, this.y + 15);
    this.afterCollision++; // 衝突後の描画カウント
  }
  Box.prototype.collision = function() {
    this.collisioned = true;
    this.afterCollision = 0;
    // 衝突フラッグを立て、この先20回の描画後に解除
    $('#collision-sound')[0].play()
    this.num--;
    score++;
    $('#score').text(score);
    if (this.num === 0) this.deleteBox();
  }
  Box.prototype.deleteBox = function() {
    var thisId = this.id;
    // boxesの中のそれぞれのインスタンスから、idが消去したいボックスと同じものを探す
    boxes.filter(function(box, index) {
      if (box.id === thisId) {
        boxes.splice(index, 1);
        // ここで削除。それぞれのboxインデックス番号が1減る
        // よって次も初期化時は、インデックスに依存せず、設定した固有のidで消したいboxを探す
      }
    });
  }

  // boxとボールの当たり判定
  function collisionDetecion() {
    boxes.some(box => {
      var horizontal = isH(theBall.x, theBall.y, box.x, box.y);
      var vertical = isV(theBall.x, theBall.y, box.x, box.y);

      // 衝突判定が出た場合
      if (horizontal || vertical) {
        // 反射後のスピード
        var nextVX = horizontal ? theBall.vx * -1 : theBall.vx;
        var nextVY = vertical ? theBall.vy * -1 : theBall.vy;
        // 次の座標x,y計算
        var nextX = theBall.x + nextVX;
        var nextY = theBall.y + nextVY;
        // 次のフレームでの判定
        var NextHorizontal = isH(nextX, nextY, box.x, box.y);
        var NextVerticval = isH(nextX, nextY, box.x, box.y);

        if (horizontal && NextHorizontal) {
          // もし、連続して左右判定がでるとボックス辺付近で反射し続けるから、上下に当たったことにする
          theBall.vy *= -1;
        } else if (horizontal) {
          theBall.vx *= -1;
        }

        if (vertical && NextVerticval) {
          // 連続して上下判定になるようなら、左右に当たったことにする
          theBall.vx *= -1;
        } else if (vertical) {
          theBall.vy *= -1;
        }

        box.collision();
        return true;
        // 1フレームに衝突は一回までだから抜ける
      }
      
    });
  }
  // a,b=>ballのx,y c,d=>boxの原点(左上)  
  function isH(a, b, c, d) { // 水平（左右）面に当たったか
    var part1 = b > -a + c + d + 30 && b < a - c + d && a < c + 30;
    var part2 = b < -a + c + d + 30 && b > a - c + d && a > c;
    return part1 || part2;
  }
  function isV(a, b, c, d) { // 鉛直面
    var part1 = b < -a + c + d + 30 && b < a - c + d && b > d;
    var part2 = b > -a + c + d + 30 && b > a - c + d && b < d + 30;
    return part1 || part2;
  }

  var DeadZone = function() {
    this.draw = function() {
      ctx.fillStyle = theBall.y <= 450 ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 0, 0, 0.8)';
      ctx.fillRect(0, 450, canvas.width, 50);
    }
  }

  // アロー（下の矢印制御）(canvasではなくDOM -> スタイルはcss)
  var Arrow = function() {
    this.deg = -10; // 時計回りが正だから、-10度が初期値
    this.updateRad = 0; // deg = 80cos(Rad)-90のRad（無限に大きくなってく）
    this.running = false;
    
    this.calcRad = function() {
      return Math.PI / 180 * Math.abs(this.deg);
      // 呼び出された瞬間の角度をラジアンに変換
    }
    this.show = function() {
      $('#arrow').css('transform', `translateX(${initBall - 150}px) rotate(${this.deg}deg)`).show(); // initBallの位置に合うようにずらしてから表示
    }
    this.draw = function() {
      // 角度は-10 ~ -170度間を、cosカーブの振動に合わせて更新
      this.deg = 80 * Math.cos(this.updateRad) - 90;
      $('#arrow').css('transform', `translateX(${initBall - 150}px) rotate(${this.deg}deg)`);
      this.updateRad = this.updateRad + Math.PI / 270;
      this.running = true;
    }
    this.update = function() {
      var that = this;
      this.updateID = setInterval(function() { that.draw() }, 30);
    }
    this.stop = function() {
      clearInterval( this.updateID );
      this.running = false
    }
  }

  // 初期化
  function initGame() {
    score = 0;
    $('#score').text(score);
    playing = false;
    boxes = [];

    // インスタンス作成
    initBall = rand(120, 180); // ボールの初期Xランダム120~180
    theBall = new Ball(initBall, 440);
    deadZone = new DeadZone;
    setBoxes();

    // 初期描画
    theBall.draw();
    boxes.forEach(box => { box.draw(); });
    deadZone.draw();

    $('#bottom-text').show();
  }
  initGame(); // ページを読み込んだら即初期化

  // ゲームスタート操作（スイングするアローの角度に対応した向きに発射）
  $('#game-field, #arrow').on('click', () => {
    if (!theArrow) {
      theArrow = new Arrow; // はじめの1クリックでインスタンス作成
    }
    if (!playing) { // プレイ中にクリックしても意味ない
      if (!theArrow.running) {
        theArrow.show(); // display:none解除
        theArrow.update(); // -10 ~ -170度の間をスイング
        $('#bottom-text').fadeOut();
      } else { // 既にアローがスイングしてるときにクリックしたら
        playing = true; // プレイ開始フラッグ
        theArrow.stop(); 
        $('#arrow').fadeOut();
        $('#restart').css('visibility', 'visible')
        // console.log(theArrow.deg); // デバッグ用
        var rad = theArrow.calcRad(); // この瞬間の角度をラジアンに変換
        theBall.vx = 2 * Math.cos(rad); // ボールの初速度設定(vx, vy)
        theBall.vy = -2 * Math.sin(rad);
        updateID = setInterval(update, updateInterval); // スタート
      }
    }
  });
  
  // このupdate()はclearInterval(updateID)でstop
  function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // コンテクスト全消し
    theBall.move();
    theBall.draw();
    collisionDetecion(); // ボールが動いた結果,boxと衝突したか判定
    boxes.forEach(box => {
      box.draw();
    });
    deadZone.draw(); // ほぼ静的なコンテクストだけど、全消ししてるからまた描画
  }

  function finishGame() {
    clearInterval(updateID); // 描画update解除
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    $('#restart').css('visibility', 'hidden');
    $('#result-sound')[0].play()
    showresult(score);
    initGame();
  }


  function setBoxes() {
    // 上段
    for (var i = 0; i < 10; i++) {
      boxes.push( new Box(30 * i, 0, num, boxes.length) )
    }
    // 左列
    for (var i = 0; i < 12; i++) {
      boxes.push( new Box(0, 30 * i + 30, num, boxes.length) )
    }
    // 2列目
    for (var i = 0; i < 8; i++) {
      boxes.push( new Box(45, 40 * i + 40, num, boxes.length) )
    }
    // 3列目
    for (var i = 0; i < 8; i++) {
      boxes.push( new Box(90, 40 * i + 50, num, boxes.length) )
    }
    // 4列目
    for (var i = 0; i < 8; i++) {
      boxes.push( new Box(135, 40 * i + 40, num, boxes.length) )
    }
    // 5列目
    for (var i = 0; i < 8; i++) {
      boxes.push( new Box(180, 40 * i + 50, num, boxes.length) )
    }
    // 6列目
    for (var i = 0; i < 8; i++) {
      boxes.push( new Box(225, 40 * i + 40, num, boxes.length) )
    }
    // 右列
    for (var i = 0; i < 12; i++) {
      boxes.push( new Box(270, 30 * i + 30, num, boxes.length) )
    }
    // 下段左
    for (var i = 0; i < 3; i++) {
      boxes.push( new Box(30 * i, 390, num, boxes.length) )
    }
    // 下段右
    for (var i = 0; i < 3; i++) {
      boxes.push( new Box(30 * i + 210, 390, num, boxes.length) )
    }
  }

  $('#restart').click(function() {
    finishGame();
  });

  var sayings = [
    'Start where you are. Use what you have. Do what you can.',
    'It is in your moments of decision that your destiny is shaped.',
    'The world breaks everyone, and afterward, some are strong at the broken places.',
    'Success is never permanent, and failure is never final.',
    'Luck is a matter of preparation meeting opportunity.',
    'Step by step. I can’t see any other way of accomplishing anything.',
    'He can who thinks he can, and he can’t who thinks he can’t. This is an inexorable, indisputable law.',
    'Don’t sidestep suffering. You have to go through it to get where you’re going.',
    'God doesn’t require us to succeed; he only requires that you try.',
    'It is in your moments of decision that your destiny is shaped.',
    'It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.',
  ]

  function showresult(score) {
    $('#result').fadeIn(500, function() {
      $('.result-outer').fadeIn(500);
    })
    $('#result-score').text(score + 'pt');
    var msg;
    switch (true) {
      case score >= 790:
        msg = 'フルコンボ！！！<br>..他のことにこの運を使いましょう'
      case score >= 700:
        msg = '数年に一度の逸材<br>しかしフルコンボまではあと90!'
        break;
      case score >= 600:
        msg = 'さては、やり込み勢の方ですね？'
        break;
      case score >= 500:
        msg = 'エクセレント！<br>..しかしトップクラスまでは程遠し。'
        break;
      case score >= 400:
        msg = '優良＋＋'
        break;
      case score >= 350:
        msg = '優良。'
        break;
      case score >= 300:
        msg = '良'
        break;
      case score >= 250:
        msg = '可'
        break;
      case score >= 200:
        msg = 'Well...<br>Nice try'
        break;
      case score >= 150:
        msg = 'よくがんばりました。'
        break;
      case score >= 100:
        msg = 'がんばりましょう'
        break;
      case score >= 75:
        msg = 'あれれ..<br>どうしましたか？'
        break;
      case score >= 50:
        msg = '手が滑りましたか？'
        break;
      case score >= 20:
        msg = '徒然草'
        break;
      default:
        msg = '草'
        break;
    } 
    $('#result-msg').html(msg);
    $('#saying').text(sayings[rand(0, sayings.length)]);
    // ランダム名言を表示
  }
  
  $('#result-close').click(function() {
    $('.result-outer').fadeOut(500, function() {
      $('#result').slideUp(500);
    })
  });

  $('.game-topbar .fas').click(function() {
    if ( audio.prop('volume') === 0 ) {
      audio.prop('volume', 1)
    } else {
      audio.prop('volume', 0)
    }
    $('.game-topbar .fas').toggleClass('active');
  })

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }
});