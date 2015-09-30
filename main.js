
var pollRac = new Ractive({
  el: '#bignumbers',
  template: '#bignumbers_tpl',
  data: {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    total: 0,
    resultsVisible: false
  }
});

pollRac.on({
  showResults: function(evt) {
    console.log(this);
    console.log(evt);
    this.set('resultsVisible', true);
  }
})

var pubnub = PUBNUB.init({
  publish_key: 'demo',
  subscribe_key: 'sub-c-KEY-HERE'
});

pubnub.subscribe({
  channel: 'channel_here',
  message: function(m){
    var letter = m.slice(0,1).toLowerCase();
    if (/[abcd]/.test(letter)) {
      pollRac.add(letter);
      pollRac.add('total');
    }
  }
});

