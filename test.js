require(['plotly'], function (Plotly) {
  window.PLOTLYENV = window.PLOTLYENV || {};
  if (document.getElementById('4aebbc60-f7da-4e93-b845-1406603ae16e')) {
    Plotly.newPlot(
    ).then(function () {
      var gd = document.getElementById('4aebbc60-f7da-4e93-b845-1406603ae16e');
      var x = new MutationObserver(function (mutations, observer) {
        {
          var display = window.getComputedStyle(gd).display;
          if (!display || display === 'none') {
            {
              console.log([gd, 'removed!']);
              Plotly.purge(gd);
              observer.disconnect();
            }
          }
        }
      });

      // Listen for the removal of the full notebook cells
      var notebookContainer = gd.closest('#notebook-container');
      if (notebookContainer) {
        {
          x.observe(notebookContainer, { childList: true });
        }
      }

      // Listen for the clearing of the current output cell
      var outputEl = gd.closest('.output');
      if (outputEl) {
        {
          x.observe(outputEl, { childList: true });
        }
      }
    });
  }
});
